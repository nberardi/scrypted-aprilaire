/**
 * Outbound queue with NACK retry: host SEQ 0–127, same-frame retries for
 * 0x01 / 0x03 / 0x09 (2 extra tries, 0.5s), other NACKs clear the transaction.
 */

import { NackResponse } from "./BasePayloadResponse";

/** 1 initial send + 2 retries */
export const NACK_RETRY_MAX_ATTEMPTS = 3;

/** Default delay between retry attempts (Guide: 0.5–1s) */
export const NACK_RETRY_DELAY_MS = 500;

/** Home-automation sequence numbers occupy 0–127; the thermostat uses 128–255. */
export const HOST_SEQUENCE_COUNT = 128;

export interface OutboundRequest {
    action: number;
    domain: number;
    attribute: number;
    data: Buffer;
}

export interface InFlightRequest {
    sequence: number;
    frame: Buffer;
    request: OutboundRequest;
    /** Number of times this frame has been sent (1 = initial) */
    attempts: number;
}

export interface PermanentNackEvent {
    statusCode: number;
    sequence: number;
    request: OutboundRequest;
    attempts: number;
}

export type FrameBuilder = (sequence: number, request: OutboundRequest) => Buffer;
export type FrameSender = (frame: Buffer) => void;
/** Returns a cancel function (like clearTimeout). */
export type TimerScheduler = (callback: () => void, delayMs: number) => () => void;

export interface OutboundRequestQueueOptions {
    maxAttempts?: number;
    retryDelayMs?: number;
    onPermanentNack?: (event: PermanentNackEvent) => void;
    /**
     * Transport readiness gate. While this returns false, commands accumulate in
     * `pending` instead of being framed and written. Call {@link OutboundRequestQueue.flush}
     * once the transport becomes writable.
     */
    canSend?: () => boolean;
}

/** Retryable NACK codes: 0x01 Generic, 0x03 Busy, 0x09 Timeout. */
export function isRetryableNack(statusCode: number): boolean {
    return new NackResponse(statusCode).shouldRetry;
}

export class OutboundRequestQueue {
    private pending: OutboundRequest[] = [];
    private inFlight = new Map<number, InFlightRequest>();
    private retryCancels = new Map<number, () => void>();
    /** Drop in-flight tracking after this long with no NACK (command assumed accepted). */
    private idleCancels = new Map<number, () => void>();
    private sequence = 0;
    /** Count of outstanding retry timers (pauses new sends while > 0). */
    private retryPending = 0;

    private readonly maxAttempts: number;
    private readonly retryDelayMs: number;
    private readonly onPermanentNack?: (event: PermanentNackEvent) => void;
    private readonly canSend: () => boolean;
    /** How long to keep a frame for possible NACK after its last send. */
    private readonly idleTtlMs: number;

    constructor(
        private readonly buildFrame: FrameBuilder,
        private readonly sendFrame: FrameSender,
        private readonly schedule: TimerScheduler = defaultScheduler,
        options: OutboundRequestQueueOptions = {}
    ) {
        this.maxAttempts = options.maxAttempts ?? NACK_RETRY_MAX_ATTEMPTS;
        this.retryDelayMs = options.retryDelayMs ?? NACK_RETRY_DELAY_MS;
        this.onPermanentNack = options.onPermanentNack;
        this.canSend = options.canSend ?? (() => true);
        this.idleTtlMs = this.maxAttempts * this.retryDelayMs + 2000;
    }

    /** Next sequence that will be assigned to a new command (0–127). */
    get nextSequence(): number {
        return this.sequence;
    }

    get pendingCount(): number {
        return this.pending.length;
    }

    get inFlightCount(): number {
        return this.inFlight.size;
    }

    /** True when new commands are held because a retry is scheduled. */
    get isBlocked(): boolean {
        return this.retryPending > 0;
    }

    /** Test/inspection helper: in-flight entry for a sequence. */
    getInFlight(sequence: number): InFlightRequest | undefined {
        return this.inFlight.get(sequence);
    }

    /**
     * Enqueue an outbound request. Sent immediately unless a retry is pending or
     * the transport is not writable, in which case it waits.
     * @returns sequence number assigned when the request is first sent, or -1 if still queued
     */
    enqueue(request: OutboundRequest): number {
        this.pending.push(request);
        return this.drain();
    }

    /**
     * Send anything held back by the transport gate. Called when the socket
     * becomes writable.
     */
    flush(): number {
        return this.drain();
    }

    /**
     * Handle a NACK for a previously sent sequence.
     * Retryable codes re-send the same frame; others clear the transaction.
     */
    handleNack(statusCode: number, sequence: number): void {
        const entry = this.inFlight.get(sequence);
        if (!entry)
            return;

        if (isRetryableNack(statusCode) && entry.attempts < this.maxAttempts) {
            this.scheduleRetry(entry);
            return;
        }

        this.clearInFlight(sequence);
        this.onPermanentNack?.({
            statusCode,
            sequence: entry.sequence,
            request: entry.request,
            attempts: entry.attempts,
        });
        this.drain();
    }

    /**
     * Drop tracking for a sequence (e.g. after a matching success if known).
     * Does not advance pending queue beyond normal drain rules.
     */
    clearSequence(sequence: number): void {
        this.clearInFlight(sequence);
    }

    /** Cancel timers and drop all state (intentional disconnect). */
    reset(): void {
        for (const cancel of this.retryCancels.values()) {
            cancel();
        }
        this.retryCancels.clear();
        for (const cancel of this.idleCancels.values()) {
            cancel();
        }
        this.idleCancels.clear();
        this.inFlight.clear();
        this.pending = [];
        this.retryPending = 0;
    }

    /**
     * Unexpected link loss / socket replace: keep unsent commands and put
     * in-flight requests back on the pending queue (they get a new sequence
     * on the next send). Intentional {@link reset} is what drops everything.
     *
     * In-flight frames may already have reached the thermostat; re-sending the
     * same setpoint/mode write is idempotent enough. Losing the write leaves
     * Scrypted showing a command the device never got.
     */
    requeueForReconnect(): void {
        for (const cancel of this.retryCancels.values()) {
            cancel();
        }
        this.retryCancels.clear();
        for (const cancel of this.idleCancels.values()) {
            cancel();
        }
        this.idleCancels.clear();
        this.retryPending = 0;

        const inflight: OutboundRequest[] = [];
        for (const entry of this.inFlight.values()) {
            inflight.push(entry.request);
        }
        this.inFlight.clear();
        this.pending = [...inflight, ...this.pending];
    }

    /**
     * Drain pending commands while not blocked by a scheduled retry and the
     * transport reports it can accept frames.
     * @returns sequence of the last command started this call, or -1
     */
    private drain(): number {
        let lastSeq = -1;
        while (this.pending.length > 0 && this.retryPending === 0 && this.canSend()) {
            const request = this.pending.shift()!;
            lastSeq = this.sendNew(request);
        }
        return lastSeq;
    }

    private sendNew(request: OutboundRequest): number {
        const seq = this.sequence;
        // Advance only for a new command — retries reuse the stored sequence/frame.
        this.sequence = (this.sequence + 1) % HOST_SEQUENCE_COUNT;

        const frame = this.buildFrame(seq, request);
        const entry: InFlightRequest = {
            sequence: seq,
            frame,
            request,
            attempts: 1,
        };
        this.inFlight.set(seq, entry);
        this.sendFrame(frame);
        this.armIdleCleanup(seq);
        return seq;
    }

    private scheduleRetry(entry: InFlightRequest): void {
        // Cancel any existing retry timer for this sequence
        const hadRetryTimer = this.retryCancels.has(entry.sequence);
        this.retryCancels.get(entry.sequence)?.();
        if (!hadRetryTimer) {
            this.retryPending++;
        }

        // Pause idle cleanup while we intend to retry
        this.idleCancels.get(entry.sequence)?.();
        this.idleCancels.delete(entry.sequence);

        const cancel = this.schedule(() => {
            this.retryCancels.delete(entry.sequence);
            this.retryPending = Math.max(0, this.retryPending - 1);

            // Entry may have been cleared (reset) while waiting
            if (!this.inFlight.has(entry.sequence)) {
                this.drain();
                return;
            }

            entry.attempts++;
            // Re-send identical frame (same sequence baked into header + CRC)
            this.sendFrame(entry.frame);
            this.armIdleCleanup(entry.sequence);
            this.drain();
        }, this.retryDelayMs);

        this.retryCancels.set(entry.sequence, cancel);
    }

    private armIdleCleanup(sequence: number): void {
        this.idleCancels.get(sequence)?.();
        const cancel = this.schedule(() => {
            this.idleCancels.delete(sequence);
            // Only drop if no retry is scheduled
            if (!this.retryCancels.has(sequence)) {
                this.inFlight.delete(sequence);
            }
        }, this.idleTtlMs);
        this.idleCancels.set(sequence, cancel);
    }

    private clearInFlight(sequence: number): void {
        if (this.retryCancels.has(sequence)) {
            this.retryCancels.get(sequence)!();
            this.retryCancels.delete(sequence);
            this.retryPending = Math.max(0, this.retryPending - 1);
        }
        this.idleCancels.get(sequence)?.();
        this.idleCancels.delete(sequence);
        this.inFlight.delete(sequence);
    }
}

function defaultScheduler(callback: () => void, delayMs: number): () => void {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
}
