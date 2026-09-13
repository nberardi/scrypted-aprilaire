/**
 * Reconnect supervision for the single long-lived Aprilaire TCP session.
 *
 * A healthy link can be silent (COS + Sync, not polling). This class only
 * reconnects dropped sockets with exponential backoff and abandons connect
 * attempts that never become ready. Half-open sockets are left to TCP keepalive.
 */

export type CancelTimer = () => void;
export type SupervisorScheduler = (callback: () => void, delayMs: number) => CancelTimer;

export interface ConnectionSupervisorOptions {
    initialDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
    /** Fractional jitter (0 = none, 0.2 = ±20%). */
    jitterRatio?: number;
    connectTimeoutMs?: number;
    schedule?: SupervisorScheduler;
    now?: () => number;
    random?: () => number;
}

export interface ConnectionSupervisorHooks {
    connect: () => void;
    drop: (reason: string) => void;
    log?: (message: string) => void;
}

export const DEFAULT_INITIAL_DELAY_MS = 1_000;
export const DEFAULT_MAX_DELAY_MS = 60_000;
export const DEFAULT_FACTOR = 2;
export const DEFAULT_JITTER_RATIO = 0.2;
export const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;

export interface BackoffParameters {
    initialDelayMs: number;
    maxDelayMs: number;
    factor: number;
    jitterRatio: number;
}

/**
 * Delay for a zero-based consecutive-failure count:
 * `min(max, initial * factor^attempt)` then ±jitter. `random() === 0.5` is unjittered.
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
    private readonly schedule: SupervisorScheduler;
    private readonly random: () => number;

    private supervising = false;
    private linkUp = false;
    private attempt = 0;

    private cancelReconnect?: CancelTimer;
    private cancelConnectTimeout?: CancelTimer;

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
        this.schedule = options.schedule ?? defaultScheduler;
        this.random = options.random ?? Math.random;
    }

    get isSupervising(): boolean {
        return this.supervising;
    }

    get isLinkUp(): boolean {
        return this.linkUp;
    }

    get attempts(): number {
        return this.attempt;
    }

    get isReconnectScheduled(): boolean {
        return this.cancelReconnect !== undefined;
    }

    start(): void {
        if (this.supervising)
            return;

        this.supervising = true;
        this.attempt = 0;
        this.beginConnect();
    }

    stop(): void {
        this.supervising = false;
        this.linkUp = false;
        this.clearReconnect();
        this.clearConnectTimeout();
    }

    notifyConnected(): void {
        this.clearConnectTimeout();
        this.clearReconnect();
        this.attempt = 0;
        this.linkUp = true;
    }

    notifyDisconnected(reason?: string): void {
        this.linkUp = false;
        this.clearConnectTimeout();

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

    private clearReconnect(): void {
        this.cancelReconnect?.();
        this.cancelReconnect = undefined;
    }

    private clearConnectTimeout(): void {
        this.cancelConnectTimeout?.();
        this.cancelConnectTimeout = undefined;
    }
}
