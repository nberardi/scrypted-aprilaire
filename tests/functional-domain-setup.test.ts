/**
 * Functional Domain: Setup (0x01),
 */
import { describe, expect, it } from "vitest";
import {
    AutoChangeoverStatus,
    DEFAULT_DEADBAND_C,
    InstallerSettingsByte,
    OutdoorSensorStatus,
    ScaleRequest,
    ScaleResponse,
    TemperatureScale,
    ThermostatInstallerSettingsResponse,
    deadbandIndexToCelsius,
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
            // Plugin consumes scale (byte 2) and outdoor sensor mode (byte 15)
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

        it("documents Installer Settings byte offsets used for deadband", () => {
            // §1.1 Thermostat Installer Settings — authoritative guide offsets.
            expect(InstallerSettingsByte.Scale).toBe(2);
            expect(InstallerSettingsByte.AutoChangeover).toBe(12);
            expect(InstallerSettingsByte.Deadband).toBe(13);
            expect(InstallerSettingsByte.OutdoorSensor).toBe(15);
        });

        it("decodes deadband index at byte 13 to °C (wire-level)", () => {
            // Protocol map: 0→1.0°C, 1→1.5°C (default 3°F), 2→2.0°C, …, 7→4.5°C
            const payload = Buffer.alloc(56, 0);
            payload[InstallerSettingsByte.Deadband] = 1; // default 3°F / 1.5°C
            payload[InstallerSettingsByte.AutoChangeover] = AutoChangeoverStatus.Enabled;

            const res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.deadbandIndex).toBe(1);
            expect(res.deadbandC).toBe(1.5);
            expect(res.autoChangeover).toBe(AutoChangeoverStatus.Enabled);
            // Production decoder must match the pure index helper.
            expect(res.deadbandC).toBe(deadbandIndexToCelsius(1));
        });

        it("decodes each valid deadband index 0–7 to half-degree °C steps", () => {
            const expectedC = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5];
            for (let index = 0; index <= 7; index++) {
                const payload = Buffer.alloc(56, 0);
                payload[InstallerSettingsByte.Deadband] = index;
                const res = new ThermostatInstallerSettingsResponse(payload);
                expect(res.deadbandIndex).toBe(index);
                expect(res.deadbandC).toBe(expectedC[index]);
                expect(deadbandIndexToCelsius(index)).toBe(expectedC[index]);
            }
        });

        it("falls back to default 1.5°C for reserved deadband indices", () => {
            expect(DEFAULT_DEADBAND_C).toBe(1.5);
            expect(deadbandIndexToCelsius(8)).toBe(DEFAULT_DEADBAND_C);
            expect(deadbandIndexToCelsius(255)).toBe(DEFAULT_DEADBAND_C);
            expect(deadbandIndexToCelsius(-1)).toBe(DEFAULT_DEADBAND_C);

            const payload = Buffer.alloc(56, 0);
            payload[InstallerSettingsByte.Deadband] = 99;
            const res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.deadbandIndex).toBe(99);
            expect(res.deadbandC).toBe(DEFAULT_DEADBAND_C);
        });
    });
});