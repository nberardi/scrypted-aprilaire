/**
 * NACK retry queue (Guide §H.5 / issue #16)
 *
 * Exercises OutboundRequestQueue retry policy, same-sequence re-send,
 * max attempts, and permanent-NACK clearing — without real TCP.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    Action,
    NAckError,
} from "../src/AprilaireClient";
import { NackResponse } from "../src/BasePayloadResponse";
import {
    isRetryableNack,
    NACK_RETRY_DELAY_MS,
    NACK_RETRY_MAX_ATTEMPTS,
    OutboundRequest,
    OutboundRequestQueue,
    PermanentNackEvent,
} from "../src/OutboundRequestQueue";

/** Minimal fake frame: SEQ at byte 1, status/marker at byte 4 for assertions */
function buildTestFrame(sequence: number, request: OutboundRequest): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeUint8(1, 0); // revision
    buf.writeUint8(sequence, 1);
    buf.writeUint8(request.action, 4);
    buf.writeUint8(request.domain, 5);
    buf.writeUint8(request.attribute, 6);
    buf.writeUint8(0xAA, 7); // sentinel CRC stand-in
    return buf;
}

function sampleRequest(attribute = 1): OutboundRequest {
    return {
        action: Action.Write,
        domain: 2,
        attribute,
        data: Buffer.from([0x01, 0x02]),
    };
}

describe("NACK retry classification (Guide §H.5)", () => {
    const retryCodes: NAckError[] = [
        NAckError.GenericError,
        NAckError.BufferFullOrDeviceBusy,
        NAckError.TimedOutWaitingForResponse,
    ];

    const clearCodes: NAckError[] = [
        NAckError.UnsupportedProtocolRevision,
        NAckError.UnknownAction,
        NAckError.UnknownFunctionalDomain,
        NAckError.UnknownAttribute,
        NAckError.ThermostateCannotAcceptWrites,
        NAckError.UnsupportedModel,
        NAckError.WriteValueOutOfRange,
        NAckError.WriteAttributeReadOnly,
        NAckError.WriteAttributeNotWritableInCurrentConfig,
        NAckError.WriteIncorrectPayloadSize,
        NAckError.ReadAttributeNotReadable,
        NAckError.ReadAttributeNotAvailable,
        NAckError.ReadIncorrectPayloadSize,
    ];

    it("isRetryableNack is true only for 0x01, 0x03, 0x09", () => {
        for (const code of retryCodes) {
            expect(isRetryableNack(code), `expected retry for 0x${code.toString(16)}`).toBe(true);
            expect(new NackResponse(code).shouldRetry).toBe(true);
        }
        for (const code of clearCodes) {
            expect(isRetryableNack(code), `expected clear for 0x${code.toString(16)}`).toBe(false);
            expect(new NackResponse(code).shouldRetry).toBe(false);
        }
    });

    it("NackResponse carries optional sequence for correlation", () => {
        const nack = new NackResponse(NAckError.BufferFullOrDeviceBusy, 42);
        expect(nack.sequence).toBe(42);
        expect(nack.statusCode).toBe(NAckError.BufferFullOrDeviceBusy);
        expect(nack.shouldRetry).toBe(true);
    });
});

describe("OutboundRequestQueue", () => {
    let sent: Buffer[];
    let permanentNacks: PermanentNackEvent[];
    let queue: OutboundRequestQueue;

    beforeEach(() => {
        vi.useFakeTimers();
        sent = [];
        permanentNacks = [];
        queue = new OutboundRequestQueue(
            buildTestFrame,
            (frame) => {
                sent.push(Buffer.from(frame));
            },
            (cb, ms) => {
                const handle = setTimeout(cb, ms);
                return () => clearTimeout(handle);
            },
            {
                onPermanentNack: (e) => permanentNacks.push(e),
            }
        );
    });

    afterEach(() => {
        queue.reset();
        vi.useRealTimers();
    });

    it("assigns sequence and advances only for new commands", () => {
        const seq0 = queue.enqueue(sampleRequest(1));
        const seq1 = queue.enqueue(sampleRequest(2));

        expect(seq0).toBe(0);
        expect(seq1).toBe(1);
        expect(queue.nextSequence).toBe(2);
        expect(sent).toHaveLength(2);
        expect(sent[0].readUint8(1)).toBe(0);
        expect(sent[1].readUint8(1)).toBe(1);
        expect(queue.getInFlight(0)?.request.attribute).toBe(1);
        expect(queue.getInFlight(1)?.request.attribute).toBe(2);
    });

    it("wraps sequence at 127 (HA range 0–126)", () => {
        for (let i = 0; i < 126; i++) {
            queue.enqueue(sampleRequest());
        }
        expect(queue.nextSequence).toBe(126);
        const seq = queue.enqueue(sampleRequest());
        expect(seq).toBe(126);
        expect(queue.nextSequence).toBe(0);
    });

    it("re-sends the same frame and sequence on retryable NACK after delay", () => {
        const seq = queue.enqueue(sampleRequest(7));
        expect(sent).toHaveLength(1);
        const original = Buffer.from(sent[0]);

        queue.handleNack(NAckError.BufferFullOrDeviceBusy, seq);
        // Not yet re-sent
        expect(sent).toHaveLength(1);
        expect(queue.isBlocked).toBe(true);
        expect(queue.getInFlight(seq)?.attempts).toBe(1);

        vi.advanceTimersByTime(NACK_RETRY_DELAY_MS - 1);
        expect(sent).toHaveLength(1);

        vi.advanceTimersByTime(1);
        expect(sent).toHaveLength(2);
        expect(sent[1].equals(original)).toBe(true);
        expect(sent[1].readUint8(1)).toBe(seq);
        expect(queue.getInFlight(seq)?.attempts).toBe(2);
        expect(queue.getInFlight(seq)?.sequence).toBe(seq);
    });

    it("reuses the same sequence across all retries (never advances mid-transaction)", () => {
        const seq = queue.enqueue(sampleRequest());
        const nextAfterFirst = queue.nextSequence;

        queue.handleNack(NAckError.GenericError, seq);
        vi.advanceTimersByTime(NACK_RETRY_DELAY_MS);
        queue.handleNack(NAckError.TimedOutWaitingForResponse, seq);
        vi.advanceTimersByTime(NACK_RETRY_DELAY_MS);

        expect(sent).toHaveLength(3); // initial + 2 retries
        for (const frame of sent) {
            expect(frame.readUint8(1)).toBe(seq);
        }
        // Next new command still uses the sequence reserved after the first send
        expect(queue.nextSequence).toBe(nextAfterFirst);
        expect(nextAfterFirst).toBe(seq + 1);
    });

    it("stops after max attempts (1 initial + 2 retries) and surfaces permanent NACK", () => {
        const seq = queue.enqueue(sampleRequest(3));

        // Attempt 1 fails → schedule retry 1
        queue.handleNack(NAckError.BufferFullOrDeviceBusy, seq);
        vi.advanceTimersByTime(NACK_RETRY_DELAY_MS);
        expect(sent).toHaveLength(2);
        expect(queue.getInFlight(seq)?.attempts).toBe(2);

        // Attempt 2 fails → schedule retry 2
        queue.handleNack(NAckError.BufferFullOrDeviceBusy, seq);
        vi.advanceTimersByTime(NACK_RETRY_DELAY_MS);
        expect(sent).toHaveLength(3);
        expect(queue.getInFlight(seq)?.attempts).toBe(3);

        // Attempt 3 fails → permanent (no more retries)
        queue.handleNack(NAckError.BufferFullOrDeviceBusy, seq);
        expect(sent).toHaveLength(3);
        expect(queue.getInFlight(seq)).toBeUndefined();
        expect(permanentNacks).toHaveLength(1);
        expect(permanentNacks[0]).toMatchObject({
            statusCode: NAckError.BufferFullOrDeviceBusy,
            sequence: seq,
            attempts: 3,
        });
        expect(permanentNacks[0].request.attribute).toBe(3);

        // No further re-send even if time advances
        vi.advanceTimersByTime(NACK_RETRY_DELAY_MS * 5);
        expect(sent).toHaveLength(3);
    });

    it("max attempts constant is 3", () => {
        expect(NACK_RETRY_MAX_ATTEMPTS).toBe(3);
    });

    it("clears transaction immediately on non-retryable NACK without re-send", () => {
        const seq = queue.enqueue(sampleRequest(9));
        queue.handleNack(NAckError.WriteValueOutOfRange, seq);

        expect(sent).toHaveLength(1);
        expect(queue.getInFlight(seq)).toBeUndefined();
        expect(permanentNacks).toHaveLength(1);
        expect(permanentNacks[0].statusCode).toBe(NAckError.WriteValueOutOfRange);
        expect(permanentNacks[0].attempts).toBe(1);

        vi.advanceTimersByTime(NACK_RETRY_DELAY_MS * 3);
        expect(sent).toHaveLength(1);
    });

    it.each([
        NAckError.UnsupportedProtocolRevision,
        NAckError.UnknownAttribute,
        NAckError.WriteAttributeReadOnly,
        NAckError.ReadAttributeNotAvailable,
    ] as const)("clears without retry for non-retryable code 0x%s", (code) => {
        const seq = queue.enqueue(sampleRequest());
        queue.handleNack(code, seq);
        expect(sent).toHaveLength(1);
        expect(permanentNacks).toHaveLength(1);
        expect(permanentNacks[0].statusCode).toBe(code);
        vi.advanceTimersByTime(NACK_RETRY_DELAY_MS);
        expect(sent).toHaveLength(1);
    });

    it("holds subsequent commands while a retry is pending, then drains", () => {
        const seq0 = queue.enqueue(sampleRequest(10));
        expect(sent).toHaveLength(1);

        queue.handleNack(NAckError.BufferFullOrDeviceBusy, seq0);
        expect(queue.isBlocked).toBe(true);

        // Enqueued while blocked — not sent yet
        const queuedSeq = queue.enqueue(sampleRequest(11));
        expect(queuedSeq).toBe(-1);
        expect(sent).toHaveLength(1);
        expect(queue.pendingCount).toBe(1);

        vi.advanceTimersByTime(NACK_RETRY_DELAY_MS);
        // Retry of first + drained second
        expect(sent).toHaveLength(3);
        expect(sent[1].readUint8(1)).toBe(seq0); // retry same seq
        expect(sent[2].readUint8(1)).toBe(1); // new command next sequence
        expect(queue.pendingCount).toBe(0);
        expect(queue.getInFlight(1)?.request.attribute).toBe(11);
    });

    it("uses configurable retry delay", () => {
        const customDelay = 750;
        const customSent: Buffer[] = [];
        const custom = new OutboundRequestQueue(
            buildTestFrame,
            (frame) => customSent.push(Buffer.from(frame)),
            (cb, ms) => {
                const handle = setTimeout(cb, ms);
                return () => clearTimeout(handle);
            },
            { retryDelayMs: customDelay }
        );

        const seq = custom.enqueue(sampleRequest());
        custom.handleNack(NAckError.GenericError, seq);

        vi.advanceTimersByTime(customDelay - 1);
        expect(customSent).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(customSent).toHaveLength(2);

        custom.reset();
    });

    it("reset cancels pending retries and drops state", () => {
        const seq = queue.enqueue(sampleRequest());
        queue.handleNack(NAckError.BufferFullOrDeviceBusy, seq);
        queue.enqueue(sampleRequest());

        queue.reset();
        expect(queue.inFlightCount).toBe(0);
        expect(queue.pendingCount).toBe(0);
        expect(queue.isBlocked).toBe(false);

        vi.advanceTimersByTime(NACK_RETRY_DELAY_MS * 3);
        expect(sent).toHaveLength(1); // no retry after reset
    });
});
