/**
 * Outbound request queue with NACK-driven retry (Guide §H.5).
 *
 * - Tracks each outbound write/read with an HA sequence number (0–126)
 * - On retryable NACK (0x01 Generic, 0x03 Busy, 0x09 Timeout): re-sends the
 *   same frame with the same sequence up to 2 additional times after a delay
 * - On non-retryable NACK or exhausted attempts: clears the transaction and
 *   notifies the caller
 * - Sequence advances only when starting a new command, never on retry
 */

import { NackResponse } from "./BasePayloadResponse";

/** 1 initial send + 2 retries */
export const NACK_RETRY_MAX_ATTEMPTS = 3;

/** Default delay between retry attempts (Guide: 0.5–1s) */
export const NACK_RETRY_DELAY_MS = 500;

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
}

/**
 * Pure retry classification matching NackResponse.shouldRetry / Guide §H.5.
 * Retryable: 0x01 Generic, 0x03 Busy, 0x09 Timeout.
 */
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
        // Cover full retry budget plus a small grace window for late NACKs.
        this.idleTtlMs = this.maxAttempts * this.retryDelayMs + 2000;
    }

    /** Next sequence that will be assigned to a new command (0–126). */
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
     * Enqueue an outbound request. Sent immediately unless a retry is pending,
     * in which case it waits until retries finish (or permanently fail).
     * @returns sequence number assigned when the request is first sent, or -1 if still queued
     */
    enqueue(request: OutboundRequest): number {
        this.pending.push(request);
        return this.drain();
    }

    /**
     * Handle a NACK for a previously sent sequence.
     * Retryable codes re-send the same frame; others clear the transaction.
     */
    handleNack(statusCode: number, sequence: number): void {
        const entry = this.inFlight.get(sequence);
        if (!entry) {
            // Unknown sequence: surface as permanent so callers still observe status
            this.onPermanentNack?.({
                statusCode,
                sequence,
                request: { action: 0, domain: 0, attribute: 0, data: Buffer.alloc(0) },
                attempts: 0,
            });
            return;
        }

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

    /** Cancel timers and drop all state (disconnect / reconnect). */
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
     * Drain pending commands while not blocked by a scheduled retry.
     * @returns sequence of the last command started this call, or -1
     */
    private drain(): number {
        let lastSeq = -1;
        while (this.pending.length > 0 && this.retryPending === 0) {
            const request = this.pending.shift()!;
            lastSeq = this.sendNew(request);
        }
        return lastSeq;
    }

    private sendNew(request: OutboundRequest): number {
        const seq = this.sequence;
        // Advance only for a new command — retries reuse the stored sequence/frame.
        this.sequence = (this.sequence + 1) % 127;

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
