/**
 * Functional Domain: Setup (0x01),
 */
import { describe, expect, it } from "vitest";
import {
    OutdoorSensorStatus,
    ScaleRequest,
    ScaleResponse,
    TemperatureScale,
    ThermostatInstallerSettingsResponse,
} from "../src/FunctionalDomainSetup";
import { FunctionalDomain, FunctionalDomainSetup } from "../src/AprilaireClient";
import { GuideAttribute } from "./helpers/guide-reference";

describe("Setup domainx", () => {
    describe(" Scale", () => {
        it("reads/writes F=0 and C=1", () => {
            expect(TemperatureScale.F).toBe(0);
            expect(TemperatureScale.C).toBe(1);

            const req = new ScaleRequest();
            req.scale = TemperatureScale.C;
            expect(req.domain).toBe(FunctionalDomain.Setup);
            expect(req.attribute).toBe(GuideAttribute.Setup.Scale);
            expect(req.attribute).toBe(FunctionalDomainSetup.Scale);
            expect(req.toBuffer()).toEqual(Buffer.from([1]));

            const res = new ScaleResponse(Buffer.from([0]));
            expect(res.scale).toBe(TemperatureScale.F);
        });
    });

    describe(" Thermostat Installer Settings (partial parse used by plugin)", () => {
        it("reads temperature scale at byte 2 and outdoor sensor at byte 15", () => {
            // Plugin only consumes scale (byte 2) and outdoor sensor mode (byte 15)
            // for multi-stat ODT automation detection.
            const payload = Buffer.alloc(56, 0);
            payload[2] = TemperatureScale.C;
            payload[15] = OutdoorSensorStatus.Automation;

            const res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.attribute).toBe(GuideAttribute.Setup.ThermostatInstallerSettings);
            expect(res.scale).toBe(TemperatureScale.C);
            expect(res.outdoorSensor).toBe(OutdoorSensorStatus.Automation);
        });

        it("maps outdoor sensor: NotInstalled / Installed / Automation", () => {
            expect(OutdoorSensorStatus.NotInstalled).toBe(0);
            expect(OutdoorSensorStatus.Installed).toBe(1);
            expect(OutdoorSensorStatus.Automation).toBe(2);
        });
    });
});
