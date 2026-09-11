/**
 * Connection supervision for the single long-lived Aprilaire TCP session.
 *
 * The guide's design rule is "prefer COS + Sync over continuous polling"
 * (Protocol Overview, design rule 1), which means a healthy link can be silent
 * for long stretches. That makes two failure modes invisible without explicit
 * supervision:
 *
 * 1. A dropped connection is never re-established, so the plugin goes quiet
 *    until something happens to issue a read.
 * 2. A half-open socket (thermostat power-cycled, NAT/firewall idle eviction)
 *    still reports `connected`, so writes vanish and devices stay "online".
 *
 * This class owns both policies and is deliberately free of `net` and timer
 * globals: callers inject `schedule`, `now`, and `random` so the behavior is
 * unit-testable without hardware or wall-clock waits.
 *
 * Reconnect uses exponential backoff with jitter, reset on every successful
 * connect. Liveness uses a probe rather than a blind idle timeout: after a
 * quiet period, send a cheap read and only declare the link dead if nothing at
 * all arrives before {@link ConnectionSupervisorOptions.probeTimeoutMs}.
 */

export type CancelTimer = () => void;
export type SupervisorScheduler = (callback: () => void, delayMs: number) => CancelTimer;

export interface ConnectionSupervisorOptions {
    /** Delay before the first reconnect attempt. */
    initialDelayMs?: number;
    /** Ceiling for the exponentially growing reconnect delay. */
    maxDelayMs?: number;
    /** Multiplier applied per consecutive failed attempt. */
    factor?: number;
    /** Fractional jitter applied to each delay (0 = none, 0.2 = ±20%). */
    jitterRatio?: number;
    /** How long a connect attempt may stay pending before it is abandoned. */
    connectTimeoutMs?: number;
    /** Quiet period on an established link before a liveness probe is sent. */
    probeAfterMs?: number;
    /** Grace period for any inbound traffic after a probe before dropping the link. */
    probeTimeoutMs?: number;
    schedule?: SupervisorScheduler;
    now?: () => number;
    /** Uniform random source in [0, 1); injected for deterministic tests. */
    random?: () => number;
}

export interface ConnectionSupervisorHooks {
    /** Open a fresh socket. Must eventually lead to notifyConnected or notifyDisconnected. */
    connect: () => void;
    /** Send a cheap read used only to prove the link still carries traffic. */
    probe: () => void;
    /** Tear down the current socket; expected to surface as notifyDisconnected. */
    drop: (reason: string) => void;
    log?: (message: string) => void;
}

export const DEFAULT_INITIAL_DELAY_MS = 1_000;
export const DEFAULT_MAX_DELAY_MS = 60_000;
export const DEFAULT_FACTOR = 2;
export const DEFAULT_JITTER_RATIO = 0.2;
export const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;
export const DEFAULT_PROBE_AFTER_MS = 5 * 60_000;
export const DEFAULT_PROBE_TIMEOUT_MS = 20_000;

export interface BackoffParameters {
    initialDelayMs: number;
    maxDelayMs: number;
    factor: number;
    jitterRatio: number;
}

/**
 * Delay for a zero-based consecutive-failure count.
 *
 * The un-jittered series is `initial * factor^attempt` capped at `maxDelayMs`;
 * jitter then spreads it by `±jitterRatio` so several thermostats recovering
 * from the same outage do not reconnect in lockstep. `random() === 0.5` yields
 * exactly the un-jittered value.
 */
export function computeBackoffDelay(
    attempt: number,
    parameters: BackoffParameters,
    random: () => number = Math.random
): number {
    const { initialDelayMs, maxDelayMs, factor, jitterRatio } = parameters;
    const safeAttempt = Math.max(0, Math.floor(attempt));
    const base = Math.min(maxDelayMs, initialDelayMs * Math.pow(factor, safeAttempt));
    const spread = base * jitterRatio * (random() * 2 - 1);
    return Math.max(0, Math.round(base + spread));
}

function defaultScheduler(callback: () => void, delayMs: number): CancelTimer {
    const handle = setTimeout(callback, delayMs);
    handle.unref?.();
    return () => clearTimeout(handle);
}

export class ConnectionSupervisor {
    private readonly backoff: BackoffParameters;
    private readonly connectTimeoutMs: number;
    private readonly probeAfterMs: number;
    private readonly probeTimeoutMs: number;
    private readonly schedule: SupervisorScheduler;
    private readonly now: () => number;
    private readonly random: () => number;

    private supervising = false;
    private linkUp = false;
    /** Consecutive failed attempts; drives the backoff exponent. */
    private attempt = 0;
    private lastActivityMs = 0;

    private cancelReconnect?: CancelTimer;
    private cancelConnectTimeout?: CancelTimer;
    private cancelProbeDue?: CancelTimer;
    private cancelProbeTimeout?: CancelTimer;

    constructor(
        private readonly hooks: ConnectionSupervisorHooks,
        options: ConnectionSupervisorOptions = {}
    ) {
        this.backoff = {
            initialDelayMs: options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS,
            maxDelayMs: options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
            factor: options.factor ?? DEFAULT_FACTOR,
            jitterRatio: options.jitterRatio ?? DEFAULT_JITTER_RATIO,
        };
        this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
        this.probeAfterMs = options.probeAfterMs ?? DEFAULT_PROBE_AFTER_MS;
        this.probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
        this.schedule = options.schedule ?? defaultScheduler;
        this.now = options.now ?? Date.now;
        this.random = options.random ?? Math.random;
    }

    get isSupervising(): boolean {
        return this.supervising;
    }

    get isLinkUp(): boolean {
        return this.linkUp;
    }

    /** Consecutive failed connect attempts since the last successful connect. */
    get attempts(): number {
        return this.attempt;
    }

    get isReconnectScheduled(): boolean {
        return this.cancelReconnect !== undefined;
    }

    get isProbePending(): boolean {
        return this.cancelProbeTimeout !== undefined;
    }

    /** Begin supervising and open the first connection immediately. */
    start(): void {
        if (this.supervising)
            return;

        this.supervising = true;
        this.attempt = 0;
        this.beginConnect();
    }

    /** Stop supervising (intentional shutdown). Cancels every pending timer. */
    stop(): void {
        this.supervising = false;
        this.linkUp = false;
        this.clearReconnect();
        this.clearConnectTimeout();
        this.clearProbeTimers();
    }

    /** The socket reported a usable connection. */
    notifyConnected(): void {
        this.clearConnectTimeout();
        this.clearReconnect();
        this.attempt = 0;
        this.linkUp = true;
        this.lastActivityMs = this.now();
        this.armProbeDue(this.probeAfterMs);
    }

    /** The socket closed, failed, or was torn down. */
    notifyDisconnected(reason?: string): void {
        this.linkUp = false;
        this.clearConnectTimeout();
        this.clearProbeTimers();

        if (!this.supervising)
            return;

        this.attempt++;
        const delayMs = computeBackoffDelay(this.attempt - 1, this.backoff, this.random);
        this.hooks.log?.(
            `link down${reason ? ` (${reason})` : ""}; reconnect attempt ${this.attempt} in ${delayMs}ms`
        );

        this.clearReconnect();
        this.cancelReconnect = this.schedule(() => {
            this.cancelReconnect = undefined;
            if (!this.supervising)
                return;
            this.beginConnect();
        }, delayMs);
    }

    /**
     * Any inbound frame. Resets the quiet-period clock and, when a probe is
     * outstanding, confirms the link is alive.
     */
    notifyActivity(): void {
        this.lastActivityMs = this.now();

        if (this.cancelProbeTimeout) {
            this.clearProbeTimeout();
            this.hooks.log?.("liveness probe answered");
        }

        if (this.linkUp)
            this.armProbeDue(this.probeAfterMs);
    }

    private beginConnect(): void {
        this.clearConnectTimeout();
        this.cancelConnectTimeout = this.schedule(() => {
            this.cancelConnectTimeout = undefined;
            if (!this.supervising || this.linkUp)
                return;
            this.hooks.drop(`connect timed out after ${this.connectTimeoutMs}ms`);
        }, this.connectTimeoutMs);

        this.hooks.connect();
    }

    private armProbeDue(delayMs: number): void {
        this.clearProbeDue();
        this.cancelProbeDue = this.schedule(() => {
            this.cancelProbeDue = undefined;
            this.onProbeDue();
        }, delayMs);
    }

    private onProbeDue(): void {
        if (!this.supervising || !this.linkUp)
            return;

        // Traffic arrived while the timer was pending — re-arm for the remainder.
        const quietForMs = this.now() - this.lastActivityMs;
        if (quietForMs < this.probeAfterMs) {
            this.armProbeDue(this.probeAfterMs - quietForMs);
            return;
        }

        this.hooks.log?.(`link quiet for ${quietForMs}ms; sending liveness probe`);
        this.hooks.probe();

        this.clearProbeTimeout();
        this.cancelProbeTimeout = this.schedule(() => {
            this.cancelProbeTimeout = undefined;
            if (!this.supervising || !this.linkUp)
                return;
            this.hooks.drop(`no reply to liveness probe within ${this.probeTimeoutMs}ms`);
        }, this.probeTimeoutMs);
    }

    private clearReconnect(): void {
        this.cancelReconnect?.();
        this.cancelReconnect = undefined;
    }

    private clearConnectTimeout(): void {
        this.cancelConnectTimeout?.();
        this.cancelConnectTimeout = undefined;
    }

    private clearProbeDue(): void {
        this.cancelProbeDue?.();
        this.cancelProbeDue = undefined;
    }

    private clearProbeTimeout(): void {
        this.cancelProbeTimeout?.();
        this.cancelProbeTimeout = undefined;
    }

    private clearProbeTimers(): void {
        this.clearProbeDue();
        this.clearProbeTimeout();
    }
}
