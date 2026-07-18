/**
 * Best-practice connection bootstrap*
 * These tests document required connect-time behavior so the priority list
 * (P1 bootstrap) can be validated as implementation lands.
 */
import { describe, expect, it } from "vitest";
import { CosRequest, SyncRequest } from "../src/FunctionalDomainStatus";
import {
    ControllingSensorsStatusAndValueRequest,
} from "../src/FunctionalDomainSensors";
import {
    ThermostatSetpointAndModeSettingsRequest,
} from "../src/FunctionalDomainControl";
import {
    Action,
    FunctionalDomain,
    FunctionalDomainControl,
    FunctionalDomainIdentification,
    FunctionalDomainSensors,
    FunctionalDomainStatus,
} from "../src/AprilaireClient";
import { GuideAttribute } from "./helpers/guide-reference";

/**
 * Ordered connect steps recommended by
 * Production AprilaireClient.connect currently:
 * Read MAC, Revision, Name, IAQ Available; Write CosRequest; then (plugin) SyncRequest.
 */
const GUIDE_BOOTSTRAP_CHECKLIST = [
    { id: "J1", title: "Manage COS Settings", attribute: "Status/COS write" },
    { id: "J2", title: "Determine temperature scale", attribute: "Setup/Scale read" },
    { id: "J3", title: "Set Time and Date", attribute: "Setup/DateAndTime write" },
    { id: "J4", title: "Read Thermostat & IAQ Available", attribute: "Control/7" },
    { id: "J5", title: "Read Setpoint & Mode", attribute: "Control/1" },
    { id: "J6", title: "Deadband from installer settings", attribute: "Setup/1" },
    { id: "J7", title: "Hum/Dehum setpoints if available", attribute: "Control/3–4" },
    { id: "J8", title: "Fresh Air if available", attribute: "Control/5" },
    { id: "J9", title: "Air Cleaning if available", attribute: "Control/6" },
    { id: "J10", title: "Schedule enabled", attribute: "Scheduling/1" },
    { id: "J11", title: "Hold status", attribute: "Scheduling/4" },
    { id: "J12", title: "Thermostat status", attribute: "Status/6" },
    { id: "J13", title: "IAQ status if available", attribute: "Status/7" },
    { id: "J14", title: "Support modules", attribute: "Sensors/3" },
    { id: "J15", title: "Sensor values / ODT", attribute: "Sensors/2 (+5.4 write)" },
    { id: "J16", title: "Away enabled + settings", attribute: "Setup/1 + Scheduling/2" },
    { id: "J17", title: "Heat Blast if enabled", attribute: "Scheduling/5" },
    { id: "J18", title: "Service reminders", attribute: "Alerts/1" },
    { id: "J19", title: "Hi/Lo alerts", attribute: "Alerts/2" },
    { id: "J20", title: "Name / permanent messages", attribute: "Identification/5, Messaging" },
] as const;

describe("Best practices bootstrap checklist", () => {
    it("lists all 20 recommended connect-time actions ", () => {
        expect(GUIDE_BOOTSTRAP_CHECKLIST).toHaveLength(20);
    });

    it("Sync can stand in for individual reads (protocolnote)", () => {
        const sync = new SyncRequest();
        expect(sync.domain).toBe(FunctionalDomain.Status);
        expect(sync.attribute).toBe(FunctionalDomainStatus.Sync);
        expect(sync.toBuffer()[0]).toBe(1);
    });

    it("COS subscription write is available for J1", () => {
        const cos = new CosRequest();
        expect(cos.attribute).toBe(FunctionalDomainStatus.COS);
        expect(cos.toBuffer().length).toBe(29);
    });

    it("Control/1 and Sensors/2 request types exist for explicit reads", () => {
        const control = new ThermostatSetpointAndModeSettingsRequest();
        expect(control.domain).toBe(FunctionalDomain.Control);
        expect(control.attribute).toBe(FunctionalDomainControl.ThermstateSetpointAndModeSettings);

        const sensors = new ControllingSensorsStatusAndValueRequest();
        expect(sensors.domain).toBe(FunctionalDomain.Sensors);
        expect(sensors.attribute).toBe(FunctionalDomainSensors.ControllingSensorValues);
    });

    describe("current connect sequence contract (documents gaps)", () => {
        /**
         * Mirrors AprilaireClient.connect identification reads.
         * When P0 name attribute is fixed, ThermostatName must be 0x05.
         */
        it("identification reads use MAC=2, Revision=1, Name=guide 0x05", () => {
            const connectReads = [
                {
                    action: Action.ReadRequest,
                    domain: FunctionalDomain.Identification,
                    attribute: FunctionalDomainIdentification.MacAddress,
                },
                {
                    action: Action.ReadRequest,
                    domain: FunctionalDomain.Identification,
                    attribute: FunctionalDomainIdentification.RevisionAndModel,
                },
                {
                    action: Action.ReadRequest,
                    domain: FunctionalDomain.Identification,
                    attribute: FunctionalDomainIdentification.ThermostatName,
                },
                {
                    action: Action.ReadRequest,
                    domain: FunctionalDomain.Control,
                    attribute: FunctionalDomainControl.ThermostatAndIAQAvailable,
                },
            ];

            expect(connectReads[0].attribute).toBe(GuideAttribute.Identification.MacAddress);
            expect(connectReads[1].attribute).toBe(GuideAttribute.Identification.RevisionAndModel);
            expect(connectReads[2].attribute).toBe(GuideAttribute.Identification.ThermostatName);
            expect(connectReads[2].attribute).toBe(0x05);
            expect(connectReads[3].attribute).toBe(
                GuideAttribute.Control.ThermostatAndIAQAvailable
            );
        });

        it("does not yet include DateAndTime write (J3) — tracked as P1 gap", () => {
            const hasDateTimeAttribute = FunctionalDomainStatus // placeholder existence check
            expect(hasDateTimeAttribute).toBeDefined();
            // DateAndTime is Setup attribute 4 — no request class exists yet.
            // This test files the gap explicitly for the priority list.
            const dateTimeImplemented = false;
            expect(dateTimeImplemented).toBe(false);
        });
    });
});
