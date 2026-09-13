import { describe, expect, it } from "vitest";
import { HOLD_SYNC_ECHO_TTL_MS, HoldSyncEchoGuard } from "../src/HoldSyncEchoGuard";

describe("HoldSyncEchoGuard", () => {
    it("consumes a matching fingerprint once so a later identical user hold still syncs", () => {
        const guard = new HoldSyncEchoGuard();
        guard.noteWrite("aa", "away|2|16|28||");
        expect(guard.isEcho("aa", "away|2|16|28||")).toBe(true);
        expect(guard.isEcho("aa", "away|2|16|28||")).toBe(false);
    });

    it("does not treat another thermostat's COS as an echo", () => {
        const guard = new HoldSyncEchoGuard();
        guard.noteWrite("aa", "fp");
        expect(guard.isEcho("bb", "fp")).toBe(false);
        expect(guard.isEcho("aa", "other")).toBe(false);
        expect(guard.isEcho("aa", "fp")).toBe(true);
    });

    it("expires fingerprints after the TTL", () => {
        let now = 1_000;
        const guard = new HoldSyncEchoGuard(HOLD_SYNC_ECHO_TTL_MS, () => now);
        guard.noteWrite("aa", "fp");
        now += HOLD_SYNC_ECHO_TTL_MS + 1;
        expect(guard.isEcho("aa", "fp")).toBe(false);
    });

    it("keeps a still-valid write when a newer fingerprint is recorded", () => {
        let now = 1_000;
        const guard = new HoldSyncEchoGuard(HOLD_SYNC_ECHO_TTL_MS, () => now);
        guard.noteWrite("aa", "old");
        now += 1_000;
        guard.noteWrite("aa", "new");
        expect(guard.isEcho("aa", "old")).toBe(true);
        expect(guard.isEcho("aa", "new")).toBe(true);
    });
});
