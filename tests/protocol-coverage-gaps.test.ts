/**
 * Wiki vs codebase coverage inventory for *currently implemented* domains.
 *
 * This file documents gaps that remain inside domains we already ship
 * (Control, Scheduling, Alerts, Sensors, Status, Setup, Identification).
 * Stub domains (Lockout / Messaging / Display) and full P2/P3 device UX are
 * tracked on epic #37 — they are listed here only for orientation.
 *
 * Intent: keep foundational gaps visible in CI without asserting product UX.
 */
import { describe, expect, it } from "vitest";
import {
    AirCleaningSettingsRequest,
    FreshAirSettingsRequest,
    ThermostatSetpointAndModeSettingsRequest,
} from "../src/FunctionalDomainControl";
import {
    AwaySettingsRequest,
    HeatBlastRequest,
    ScheduleHoldRequest,
} from "../src/FunctionalDomainScheduling";
import {
    ServiceRemindersStatusRequest,
} from "../src/FunctionalDomainAlerts";
import {
    ThermostatNameRequest,
} from "../src/FunctionalDomainIdentification";
import {
    CosRequest,
    CosSubscriptionIndex,
    defaultCosSubscriptionFlags,
} from "../src/FunctionalDomainStatus";
import { GuideAttribute } from "./helpers/guide-reference";

/** Gaps inside domains that already have production codecs / device wiring. */
export const IMPLEMENTED_SECTION_GAPS = [
    {
        domain: "Control",
        attribute: "Increment Setpoint (2.2)",
        status: "missing",
        note: "No request class; backlog #23",
    },
    {
        domain: "Control",
        attribute: "Fresh Air Setting (2.5)",
        status: "codec-only",
        note: "Request/response exist; no Scrypted ventilation device (#20)",
    },
    {
        domain: "Control",
        attribute: "Air Cleaning Setting (2.6)",
        status: "codec-only",
        note: "Request/response exist; no Scrypted purifier device (#21)",
    },
    {
        domain: "Control",
        attribute: "Emergency Heat mode (2.1 / 2.7)",
        status: "partial",
        note: "Wire mode exists; Scrypted EmHeat UX backlog #25",
    },
    {
        domain: "Scheduling",
        attribute: "Schedule Settings (3.1)",
        status: "missing",
        note: "Backlog #22",
    },
    {
        domain: "Scheduling",
        attribute: "Schedule Day (3.3)",
        status: "missing",
        note: "Backlog #22",
    },
    {
        domain: "Scheduling",
        attribute: "Away Settings (3.2)",
        status: "codec-only",
        note: "Request/response + COS; no settings UX (#24)",
    },
    {
        domain: "Alerts",
        attribute: "Service Reminders clear (4.1 write)",
        status: "codec-only",
        note: "Write codec ready; FilterMaintenance reset not wired (#26)",
    },
    {
        domain: "Alerts",
        attribute: "Alerts Status (4.2)",
        status: "parse-only",
        note: "COS subscribed; no device/UI surface (#27)",
    },
    {
        domain: "Alerts",
        attribute: "Alerts Settings (4.3)",
        status: "missing",
        note: "Backlog #33",
    },
    {
        domain: "Sensors",
        attribute: "Support Modules (5.3)",
        status: "missing",
        note: "Backlog #28",
    },
    {
        domain: "Status",
        attribute: "Thermostat Error (7.8)",
        status: "parse-only",
        note: "Logged on Sync/COS path; no Scrypted alert surface (#27)",
    },
    {
        domain: "Setup",
        attribute: "Contractor / IAQ installer / Reset (1.2, 1.5–1.8)",
        status: "missing",
        note: "Backlog #32",
    },
    {
        domain: "Identification",
        attribute: "Thermostat Name write (8.5)",
        status: "codec-only",
        note: "Write codec ready; no rename-from-Scrypted path (#34)",
    },
    {
        domain: "Identification",
        attribute: "MAC force-connection hold (≥5s)",
        status: "partial",
        note: "Field parsed; no explicit post-MAC hold timer",
    },
] as const;

describe("Wiki coverage — implemented section gaps", () => {
    it("tracks every documented gap with a status tag", () => {
        expect(IMPLEMENTED_SECTION_GAPS.length).toBeGreaterThanOrEqual(12);
        for (const gap of IMPLEMENTED_SECTION_GAPS) {
            expect(["missing", "codec-only", "parse-only", "partial"]).toContain(gap.status);
            expect(gap.attribute.length).toBeGreaterThan(0);
            expect(gap.note.length).toBeGreaterThan(0);
        }
    });

    it("Fresh Air / Air Cleaning / Away / Hold / Heat Blast write codecs exist", () => {
        expect(new FreshAirSettingsRequest().attribute).toBe(GuideAttribute.Control.FreshAirSetting);
        expect(new AirCleaningSettingsRequest().attribute).toBe(GuideAttribute.Control.AirCleaningSetting);
        expect(new AwaySettingsRequest().attribute).toBe(GuideAttribute.Scheduling.AwaySettings);
        expect(new ScheduleHoldRequest().attribute).toBe(GuideAttribute.Scheduling.ScheduleHold);
        expect(new HeatBlastRequest().attribute).toBe(GuideAttribute.Scheduling.HeatBlast);
        expect(new ThermostatSetpointAndModeSettingsRequest().attribute).toBe(
            GuideAttribute.Control.ThermostatSetpointAndModeSettings
        );
    });

    it("Service reminder clear + thermostat name write codecs exist", () => {
        expect(ServiceRemindersStatusRequest.clear({ airFilter: true }).toBuffer()[1]).toBe(0);
        expect(new ThermostatNameRequest().attribute).toBe(GuideAttribute.Identification.ThermostatName);
    });

    it("default COS subscribes to implemented runtime needs, not stub domains", () => {
        const flags = defaultCosSubscriptionFlags();
        expect(flags[CosSubscriptionIndex.ThermostatSetpointAndModeSettings]).toBe(1);
        expect(flags[CosSubscriptionIndex.ScheduleHold]).toBe(1);
        expect(flags[CosSubscriptionIndex.ControllingSensorValues]).toBe(1);
        expect(flags[CosSubscriptionIndex.AlertsStatus]).toBe(1);
        // Intentionally off until codecs/devices exist
        expect(flags[CosSubscriptionIndex.ScheduleSettings]).toBe(0);
        expect(flags[CosSubscriptionIndex.SupportModule]).toBe(0);
        expect(flags[CosSubscriptionIndex.Lockouts]).toBe(0);
        expect(new CosRequest().toBuffer().length).toBe(29);
    });
});
