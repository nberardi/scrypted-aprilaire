/**
 * Connection supervision: reconnect with backoff after a drop, and abandon
 * connect attempts that never become ready. Half-open sockets are TCP keepalive.
 *
 * Timers and the clock are injected, so nothing here waits on wall time.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    CancelTimer,
    computeBackoffDelay,
    ConnectionSupervisor,
    DEFAULT_FACTOR,
    DEFAULT_INITIAL_DELAY_MS,
    DEFAULT_JITTER_RATIO,
    DEFAULT_MAX_DELAY_MS,
} from "../src/ConnectionSupervisor";

interface FakeTask {
    at: number;
    id: number;
    callback: () => void;
    cancelled: boolean;
}

/** Deterministic scheduler + clock pair standing in for setTimeout/Date.now. */
class FakeClock {
    time = 0;
    private tasks: FakeTask[] = [];
    private nextId = 1;

    schedule = (callback: () => void, delayMs: number): CancelTimer => {
        const task: FakeTask = { at: this.time + delayMs, id: this.nextId++, callback, cancelled: false };
        this.tasks.push(task);
        return () => { task.cancelled = true; };
    };

    now = () => this.time;

    get pending(): number {
        return this.tasks.filter((t) => !t.cancelled).length;
    }

    advance(ms: number): void {
        const target = this.time + ms;

        while (true) {
            const due = this.tasks
                .filter((t) => !t.cancelled && t.at <= target)
                .sort((a, b) => (a.at - b.at) || (a.id - b.id))[0];

            if (!due)
                break;

            this.tasks = this.tasks.filter((t) => t !== due);
            this.time = due.at;
            due.callback();
        }

        this.time = target;
    }
}

const OPTIONS = {
    initialDelayMs: 1_000,
    maxDelayMs: 60_000,
    factor: 2,
    jitterRatio: 0,
    connectTimeoutMs: 20_000,
};

describe("computeBackoffDelay", () => {
    const parameters = {
        initialDelayMs: 1_000,
        maxDelayMs: 60_000,
        factor: 2,
        jitterRatio: 0,
    };

    it("grows exponentially from the initial delay", () => {
        expect(computeBackoffDelay(0, parameters)).toBe(1_000);
        expect(computeBackoffDelay(1, parameters)).toBe(2_000);
        expect(computeBackoffDelay(2, parameters)).toBe(4_000);
        expect(computeBackoffDelay(3, parameters)).toBe(8_000);
    });

    it("caps at the maximum delay", () => {
        expect(computeBackoffDelay(20, parameters)).toBe(60_000);
        expect(computeBackoffDelay(200, parameters)).toBe(60_000);
    });

    // Several thermostats recovering from one outage must not reconnect in lockstep.
    it("spreads delays within the jitter band", () => {
        const jittered = { ...parameters, jitterRatio: 0.2 };
        expect(computeBackoffDelay(1, jittered, () => 0)).toBe(1_600);
        expect(computeBackoffDelay(1, jittered, () => 0.5)).toBe(2_000);
        expect(computeBackoffDelay(1, jittered, () => 1)).toBe(2_400);
    });

    it("never returns a negative delay", () => {
        const extreme = { ...parameters, jitterRatio: 5 };
        expect(computeBackoffDelay(0, extreme, () => 0)).toBeGreaterThanOrEqual(0);
    });

    it("defaults match the shipped policy", () => {
        expect(DEFAULT_INITIAL_DELAY_MS).toBe(1_000);
        expect(DEFAULT_MAX_DELAY_MS).toBe(60_000);
        expect(DEFAULT_FACTOR).toBe(2);
        expect(DEFAULT_JITTER_RATIO).toBe(0.2);
    });
});

describe("ConnectionSupervisor", () => {
    let clock: FakeClock;
    let connects: number;
    let drops: string[];
    let supervisor: ConnectionSupervisor;

    beforeEach(() => {
        clock = new FakeClock();
        connects = 0;
        drops = [];
        supervisor = new ConnectionSupervisor(
            {
                connect: () => { connects++; },
                drop: (reason) => { drops.push(reason); },
            },
            { ...OPTIONS, schedule: clock.schedule, random: () => 0.5 }
        );
    });

    it("connects immediately on start and ignores a second start", () => {
        supervisor.start();
        expect(connects).toBe(1);
        expect(supervisor.isSupervising).toBe(true);

        supervisor.start();
        expect(connects).toBe(1);
    });

    it("reconnects with growing backoff after each failure", () => {
        supervisor.start();
        expect(connects).toBe(1);

        supervisor.notifyDisconnected("socket closed");
        expect(supervisor.attempts).toBe(1);
        expect(supervisor.isReconnectScheduled).toBe(true);

        clock.advance(999);
        expect(connects).toBe(1);
        clock.advance(1);
        expect(connects).toBe(2);

        // Second failure waits twice as long.
        supervisor.notifyDisconnected("socket closed");
        clock.advance(1_999);
        expect(connects).toBe(2);
        clock.advance(1);
        expect(connects).toBe(3);

        // Third failure waits 4s.
        supervisor.notifyDisconnected("socket closed");
        clock.advance(4_000);
        expect(connects).toBe(4);
        expect(supervisor.attempts).toBe(3);
    });

    it("resets backoff after a successful connect", () => {
        supervisor.start();
        supervisor.notifyDisconnected();
        supervisor.notifyDisconnected();
        expect(supervisor.attempts).toBe(2);

        supervisor.notifyConnected();
        expect(supervisor.attempts).toBe(0);
        expect(supervisor.isLinkUp).toBe(true);

        // Next drop is back to the initial delay, not the escalated one.
        const before = connects;
        supervisor.notifyDisconnected();
        clock.advance(1_000);
        expect(connects).toBe(before + 1);
    });

    it("abandons a connect attempt that never reports ready", () => {
        supervisor.start();

        clock.advance(OPTIONS.connectTimeoutMs - 1);
        expect(drops).toHaveLength(0);

        clock.advance(1);
        expect(drops).toHaveLength(1);
        expect(drops[0]).toContain("connect timed out");
    });

    it("does not abandon a connect attempt that succeeds in time", () => {
        supervisor.start();
        clock.advance(1_000);
        supervisor.notifyConnected();

        clock.advance(OPTIONS.connectTimeoutMs * 2);
        expect(drops).toHaveLength(0);
    });

    it("stops reconnecting after stop()", () => {
        supervisor.start();
        supervisor.notifyConnected();
        supervisor.stop();

        expect(supervisor.isSupervising).toBe(false);
        expect(supervisor.isLinkUp).toBe(false);

        supervisor.notifyDisconnected();
        clock.advance(60_000);

        expect(connects).toBe(1);
        expect(drops).toHaveLength(0);
    });

    it("leaves no live timers behind after stop()", () => {
        supervisor.start();
        supervisor.notifyConnected();
        supervisor.notifyDisconnected();

        supervisor.stop();
        expect(clock.pending).toBe(0);
    });

    it("can be restarted after stop()", () => {
        supervisor.start();
        supervisor.stop();
        supervisor.start();
        expect(connects).toBe(2);
        expect(supervisor.isSupervising).toBe(true);
    });
});
