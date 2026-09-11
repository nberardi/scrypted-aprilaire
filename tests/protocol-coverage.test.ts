/**
 * Wiki codec coverage for implemented functional domains.
 *
 * Protocol request/response classes must exist for every attribute in a domain
 * we already ship. Remaining *product* (Scrypted) gaps are listed so they are
 * not mistaken for missing wire codecs.
 */
import { describe, expect, it } from "vitest";
import { BasePayloadRequest } from "../src/BasePayloadRequest";
import {
    AirCleaningSettingsRequest,
    FreshAirSettingsRequest,
    IncrementSetpointRequest,
    ThermostatSetpointAndModeSettingsRequest,
} from "../src/FunctionalDomainControl";
import {
    ScheduleDayReadRequest,
    ScheduleDayRequest,
    ScheduleSettingsRequest,
} from "../src/FunctionalDomainScheduling";
import { SupportModulesRequest } from "../src/FunctionalDomainSensors";
import {
    AlertsSettingsRequest,
    ServiceRemindersStatusRequest,
} from "../src/FunctionalDomainAlerts";
import { ThermostatNameRequest } from "../src/FunctionalDomainIdentification";
import {
    ControlSetup,
    DateAndTimeRequest,
    ScaleRequest,
} from "../src/FunctionalDomainSetup";
import { CosReadRequest, SyncRequest } from "../src/FunctionalDomainStatus";

describe("protocol coverage — implemented domains", () => {
    it("Control has write codecs for increment, fresh air, and air cleaning", () => {
        expect(new IncrementSetpointRequest().toBuffer().length).toBe(4);
        expect(new FreshAirSettingsRequest().toBuffer().length).toBe(2);
        expect(new AirCleaningSettingsRequest().toBuffer().length).toBe(2);
        expect(new ThermostatSetpointAndModeSettingsRequest().toBuffer().length).toBe(4);
    });

    it("Scheduling has Schedule Settings + Schedule Day (read selector vs 21-byte write)", () => {
        expect(new ScheduleSettingsRequest().toBuffer().length).toBe(1);
        expect(new ScheduleDayReadRequest().toReadBuffer().length).toBe(1);
        expect(new ScheduleDayRequest().toBuffer().length).toBe(21);
    });

    it("Sensors Support Modules read uses a selector byte, not a write body", () => {
        const req = new SupportModulesRequest(1);
        expect(req.toReadBuffer()).toEqual(Buffer.from([1]));
        expect(req.toBuffer()).toEqual(Buffer.alloc(0));
    });

    it("Alerts has reminder clear write and Alerts Settings 21-byte codec", () => {
        expect(ServiceRemindersStatusRequest.clear({ hvac: true }).toBuffer().length).toBe(10);
        expect(new AlertsSettingsRequest().toBuffer().length).toBe(21);
    });

    it("Identification name write is 24 bytes; Setup scale read stays empty", () => {
        expect(new ThermostatNameRequest().toBuffer().length).toBe(24);
        expect(new ScaleRequest().toReadBuffer().length).toBe(0);
        expect(new DateAndTimeRequest().toReadBuffer().length).toBe(0);
    });

    it("generic reads do not send a write body (avoids NACK 0x22)", () => {
        const reads: BasePayloadRequest[] = [
            new CosReadRequest(),
            new ThermostatSetpointAndModeSettingsRequest(),
            new ScaleRequest(),
            new SyncRequest(),
        ];
        for (const req of reads) {
            expect(req.toReadBuffer().length).toBe(0);
        }
    });

    it("Control Setup helpers exist so Heat Only / Cool Only writes can omit unused SPs", () => {
        expect(ControlSetup.HeatOnly).toBe(1);
        expect(ControlSetup.CoolOnly).toBe(2);
    });
});

/**
 * Product-surface gaps (wiki attributes with codecs but no Scrypted device/setting yet).
 * Keep this list honest — it is the call-out for currently implemented sections.
 */
export const PRODUCT_SURFACE_GAPS = [
    "Control 2.2 Increment Setpoint — codec only; no Scrypted action (#23)",
    "Control 2.5 Fresh Air write — codec only; no ventilation device (#20)",
    "Control 2.6 Air Cleaning write — codec only; no purifier device (#21)",
    "Control 2.7 Emergency Heat — protocol mode exists; Scrypted maps EmHeat COS to Heat (#25)",
    "Scheduling 3.1 / 3.3 Schedule Settings + Schedule Day — codec only; no program editor (#22)",
    "Scheduling 3.2 Away Settings — codec + hold path; no dedicated setpoint UX (#24)",
    "Sensors 5.3 Support Modules — codec only; no per-module devices (#28)",
    "Alerts 4.1 reminder clear write — codec only; filter UI is read-only (#26)",
    "Alerts 4.2 / 7.8 alerts & thermostat errors — parsed; weak product surface (#27)",
    "Alerts 4.3 Alerts Settings — codec only; no threshold settings UI (#33)",
    "Identification 8.5 name write — codec only; Scrypted rename is local (#34)",
    "Identification 8.2 force-connection — parsed; connection is already persistent (#36)",
    "Fan Circulate — protocol FanModeSetting.Circulate exists; Scrypted Fan is Auto/Manual (#36)",
    "Setup 1.2 / 1.5–1.8 contractor, IAQ installer, reset — not implemented (#32)",
    "Lockout / Messaging / Display — stubs (#29–#31)",
] as const;

describe("product-surface gaps in implemented sections", () => {
    it("documents remaining Scrypted/UX work (not missing wire codecs)", () => {
        expect(PRODUCT_SURFACE_GAPS.length).toBeGreaterThan(10);
        expect(PRODUCT_SURFACE_GAPS.some((g) => g.includes("Emergency Heat"))).toBe(true);
        expect(PRODUCT_SURFACE_GAPS.some((g) => g.includes("Lockout"))).toBe(true);
    });
});
