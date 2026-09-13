/**
 * Suppresses Away/Vacation hold-sync echo loops.
 *
 * Broadcasting a hold to peers produces COS on those peers; without an echo
 * guard that COS is treated as a new user change and written back to the origin.
 *
 * Fingerprints we just wrote are remembered per MAC for a short TTL so a late
 * COS for an older write is still recognized after a newer hold was sent.
 */

export const HOLD_SYNC_ECHO_TTL_MS = 5_000;

export interface HoldSyncEchoEntry {
    fingerprint: string;
    expiresAt: number;
}

export class HoldSyncEchoGuard {
    private echoes = new Map<string, HoldSyncEchoEntry[]>();

    constructor(
        private readonly ttlMs: number = HOLD_SYNC_ECHO_TTL_MS,
        private readonly now: () => number = Date.now
    ) {}

    /** Record a hold fingerprint we wrote to `mac` so its COS can be ignored. */
    noteWrite(mac: string, fingerprint: string): void {
        if (!mac)
            return;
        const list = this.prune(mac);
        list.push({ fingerprint, expiresAt: this.now() + this.ttlMs });
        this.echoes.set(mac, list);
    }

    /**
     * True when this COS matches a hold we recently wrote to `mac`.
     * Consumes the matching entry so a later identical user action still syncs.
     */
    isEcho(mac: string, fingerprint: string): boolean {
        if (!mac)
            return false;
        const list = this.prune(mac);
        const index = list.findIndex((entry) => entry.fingerprint === fingerprint);
        if (index < 0)
            return false;
        list.splice(index, 1);
        this.echoes.set(mac, list);
        return true;
    }

    private prune(mac: string): HoldSyncEchoEntry[] {
        const now = this.now();
        const list = (this.echoes.get(mac) ?? []).filter((entry) => entry.expiresAt > now);
        this.echoes.set(mac, list);
        return list;
    }
}
