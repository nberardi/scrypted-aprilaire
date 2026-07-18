/**
 * Functional Domain: Setup (0x01) — Scale + Thermostat Installer Settings §1.1
 *
 * Installer byte map (guide v1.00 §1.1; pyaprilaire AWAY_AVAILABLE @ 26):
 *   2  scale
 *  12  autoChangeover
 *  13  deadband
 *  15  outdoorSensor
 *  26  awayEnabled
 *  27  heatBlastEnabled
 *  28  heatBlastOffset
 *  34  hvacServiceReminderMonths
 *  41  airFilterServiceReminderMonths
 *  42  waterPanelServiceReminderMonths
 */
import { describe, expect, it } from "vitest";
import {
    deadbandToCelsius,
    filterHoldChoicesForInstaller,
    isServiceReminderEnabled,
    OutdoorSensorStatus,
    ScaleRequest,
    ScaleResponse,
    shouldShowHeatBlastSetting,
    TemperatureScale,
    ThermostatInstallerSettingsRequest,
    ThermostatInstallerSettingsResponse,
} from "../src/FunctionalDomainSetup";
import { FunctionalDomain, FunctionalDomainSetup } from "../src/AprilaireClient";
import { GuideAttribute } from "./helpers/guide-reference";

/** Documented §1.1 offsets used by the expanded parse (and tests). */
const INSTALLER_OFFSET = {
    scale: 2,
    autoChangeover: 12,
    deadband: 13,
    outdoorSensor: 15,
    awayEnabled: 26,
    heatBlastEnabled: 27,
    heatBlastOffset: 28,
    hvacServiceReminderMonths: 34,
    airFilterServiceReminderMonths: 41,
    waterPanelServiceReminderMonths: 42,
} as const;

/** Typical installer payload size used by existing plugin tests (~44–56). */
const INSTALLER_PAYLOAD_LENGTH = 56;

function makeInstallerPayload(fields: Partial<Record<keyof typeof INSTALLER_OFFSET, number>> = {}): Buffer {
    const payload = Buffer.alloc(INSTALLER_PAYLOAD_LENGTH, 0);
    for (const [name, value] of Object.entries(fields)) {
        const offset = INSTALLER_OFFSET[name as keyof typeof INSTALLER_OFFSET];
        payload[offset] = value;
    }
    return payload;
}

describe("Setup domain", () => {
    describe("Scale", () => {
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

    describe("Thermostat Installer Settings request", () => {
        it("binds to Setup / attribute 0x01 with empty read payload", () => {
            const req = new ThermostatInstallerSettingsRequest();
            expect(req.domain).toBe(FunctionalDomain.Setup);
            expect(req.attribute).toBe(GuideAttribute.Setup.ThermostatInstallerSettings);
            expect(req.attribute).toBe(FunctionalDomainSetup.ThermostatInstallSettings);
            expect(req.toBuffer()).toEqual(Buffer.alloc(0));
        });
    });

    describe("Thermostat Installer Settings (expanded §1.1 bootstrap parse)", () => {
        it("documents the byte map offsets used by the parser", () => {
            // Keep this map in lockstep with class comments and INSTALLER_OFFSET.
            expect(INSTALLER_OFFSET).toEqual({
                scale: 2,
                autoChangeover: 12,
                deadband: 13,
                outdoorSensor: 15,
                awayEnabled: 26,
                heatBlastEnabled: 27,
                heatBlastOffset: 28,
                hvacServiceReminderMonths: 34,
                airFilterServiceReminderMonths: 41,
                waterPanelServiceReminderMonths: 42,
            });
        });

        it("parses all bootstrap fields at documented offsets on a 56-byte payload", () => {
            const payload = makeInstallerPayload({
                scale: TemperatureScale.C,
                autoChangeover: 1,
                deadband: 3, // 5F / 2.5C
                outdoorSensor: OutdoorSensorStatus.Automation,
                awayEnabled: 1,
                heatBlastEnabled: 1,
                heatBlastOffset: 2,
                hvacServiceReminderMonths: 6,
                airFilterServiceReminderMonths: 3,
                waterPanelServiceReminderMonths: 12,
            });

            const res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.attribute).toBe(GuideAttribute.Setup.ThermostatInstallerSettings);
            expect(res.scale).toBe(TemperatureScale.C);
            expect(res.autoChangeoverEnabled).toBe(true);
            expect(res.deadband).toBe(3);
            expect(res.deadbandCelsius).toBe(2.5);
            expect(res.outdoorSensor).toBe(OutdoorSensorStatus.Automation);
            expect(res.awayEnabled).toBe(true);
            expect(res.heatBlastEnabled).toBe(true);
            expect(res.heatBlastOffset).toBe(2);
            expect(res.hvacServiceReminderMonths).toBe(6);
            expect(res.hvacServiceReminderEnabled).toBe(true);
            expect(res.airFilterServiceReminderMonths).toBe(3);
            expect(res.airFilterServiceReminderEnabled).toBe(true);
            expect(res.waterPanelServiceReminderMonths).toBe(12);
            expect(res.waterPanelServiceReminderEnabled).toBe(true);
        });

        it("reads temperature scale only from byte 2 (independent of other fields)", () => {
            const payload = makeInstallerPayload({
                scale: TemperatureScale.C,
                outdoorSensor: OutdoorSensorStatus.Installed,
                deadband: 5,
            });
            const res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.scale).toBe(TemperatureScale.C);

            payload[INSTALLER_OFFSET.scale] = TemperatureScale.F;
            const resF = new ThermostatInstallerSettingsResponse(payload);
            expect(resF.scale).toBe(TemperatureScale.F);
            // other fields unchanged by scale flip
            expect(resF.outdoorSensor).toBe(OutdoorSensorStatus.Installed);
            expect(resF.deadband).toBe(5);
        });

        it("reads outdoor sensor only from byte 15", () => {
            const payload = makeInstallerPayload({
                scale: TemperatureScale.C,
                outdoorSensor: OutdoorSensorStatus.NotInstalled,
            });
            expect(new ThermostatInstallerSettingsResponse(payload).outdoorSensor).toBe(
                OutdoorSensorStatus.NotInstalled
            );

            payload[INSTALLER_OFFSET.outdoorSensor] = OutdoorSensorStatus.Installed;
            expect(new ThermostatInstallerSettingsResponse(payload).outdoorSensor).toBe(
                OutdoorSensorStatus.Installed
            );

            payload[INSTALLER_OFFSET.outdoorSensor] = OutdoorSensorStatus.Automation;
            expect(new ThermostatInstallerSettingsResponse(payload).outdoorSensor).toBe(
                OutdoorSensorStatus.Automation
            );
        });

        it("reads deadband only from byte 13", () => {
            const payload = makeInstallerPayload({ deadband: 0, scale: TemperatureScale.C });
            expect(new ThermostatInstallerSettingsResponse(payload).deadband).toBe(0);

            payload[INSTALLER_OFFSET.deadband] = 7;
            const res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.deadband).toBe(7);
            expect(res.deadbandCelsius).toBe(4.5);
            // scale still from byte 2 only
            expect(res.scale).toBe(TemperatureScale.C);
        });

        it("reads Away enable only from byte 26 (pyaprilaire AWAY_AVAILABLE index)", () => {
            const payload = makeInstallerPayload({ awayEnabled: 0 });
            expect(new ThermostatInstallerSettingsResponse(payload).awayEnabled).toBe(false);

            payload[INSTALLER_OFFSET.awayEnabled] = 1;
            expect(new ThermostatInstallerSettingsResponse(payload).awayEnabled).toBe(true);

            // reserved / other values are not enabled
            payload[INSTALLER_OFFSET.awayEnabled] = 2;
            expect(new ThermostatInstallerSettingsResponse(payload).awayEnabled).toBe(false);
        });

        it("reads Heat Blast enable only from byte 27", () => {
            const payload = makeInstallerPayload({ heatBlastEnabled: 0 });
            expect(new ThermostatInstallerSettingsResponse(payload).heatBlastEnabled).toBe(false);

            payload[INSTALLER_OFFSET.heatBlastEnabled] = 1;
            expect(new ThermostatInstallerSettingsResponse(payload).heatBlastEnabled).toBe(true);
        });

        it("reads Heat Blast offset only from byte 28", () => {
            const payload = makeInstallerPayload({ heatBlastOffset: 1 });
            expect(new ThermostatInstallerSettingsResponse(payload).heatBlastOffset).toBe(1);

            payload[INSTALLER_OFFSET.heatBlastOffset] = 0;
            expect(new ThermostatInstallerSettingsResponse(payload).heatBlastOffset).toBe(0);
        });

        it("reads auto changeover only from byte 12", () => {
            const payload = makeInstallerPayload({ autoChangeover: 0 });
            expect(new ThermostatInstallerSettingsResponse(payload).autoChangeoverEnabled).toBe(false);

            payload[INSTALLER_OFFSET.autoChangeover] = 1;
            expect(new ThermostatInstallerSettingsResponse(payload).autoChangeoverEnabled).toBe(true);
        });

        it("reads HVAC service reminder months only from byte 34", () => {
            const payload = makeInstallerPayload({ hvacServiceReminderMonths: 0 });
            let res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.hvacServiceReminderMonths).toBe(0);
            expect(res.hvacServiceReminderEnabled).toBe(false);

            payload[INSTALLER_OFFSET.hvacServiceReminderMonths] = 4;
            res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.hvacServiceReminderMonths).toBe(4);
            expect(res.hvacServiceReminderEnabled).toBe(true);

            payload[INSTALLER_OFFSET.hvacServiceReminderMonths] = 13; // Off
            res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.hvacServiceReminderMonths).toBe(13);
            expect(res.hvacServiceReminderEnabled).toBe(false);
        });

        it("reads air filter / water panel service reminder months at 41 and 42", () => {
            const payload = makeInstallerPayload({
                airFilterServiceReminderMonths: 1,
                waterPanelServiceReminderMonths: 13,
            });
            const res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.airFilterServiceReminderMonths).toBe(1);
            expect(res.airFilterServiceReminderEnabled).toBe(true);
            expect(res.waterPanelServiceReminderMonths).toBe(13);
            expect(res.waterPanelServiceReminderEnabled).toBe(false);
        });

        it("maps outdoor sensor: NotInstalled / Installed / Automation", () => {
            expect(OutdoorSensorStatus.NotInstalled).toBe(0);
            expect(OutdoorSensorStatus.Installed).toBe(1);
            expect(OutdoorSensorStatus.Automation).toBe(2);
        });

        it("defaults missing trailing bytes safely on short payloads", () => {
            // Only long enough for scale + outdoor (legacy partial size).
            const short = Buffer.alloc(16, 0);
            short[2] = TemperatureScale.C;
            short[15] = OutdoorSensorStatus.Installed;
            const res = new ThermostatInstallerSettingsResponse(short);
            expect(res.scale).toBe(TemperatureScale.C);
            expect(res.outdoorSensor).toBe(OutdoorSensorStatus.Installed);
            expect(res.awayEnabled).toBe(false);
            expect(res.heatBlastEnabled).toBe(false);
            expect(res.deadband).toBe(0);
            expect(res.hvacServiceReminderMonths).toBe(0);
            expect(res.hvacServiceReminderEnabled).toBe(false);
        });

        it("does not couple independent offsets (changing one field leaves others)", () => {
            const payload = makeInstallerPayload({
                scale: TemperatureScale.F,
                deadband: 1,
                outdoorSensor: OutdoorSensorStatus.Installed,
                awayEnabled: 1,
                heatBlastEnabled: 0,
                hvacServiceReminderMonths: 2,
            });

            // Flip only Away
            payload[INSTALLER_OFFSET.awayEnabled] = 0;
            const res = new ThermostatInstallerSettingsResponse(payload);
            expect(res.awayEnabled).toBe(false);
            expect(res.scale).toBe(TemperatureScale.F);
            expect(res.deadband).toBe(1);
            expect(res.outdoorSensor).toBe(OutdoorSensorStatus.Installed);
            expect(res.heatBlastEnabled).toBe(false);
            expect(res.hvacServiceReminderMonths).toBe(2);
        });
    });

    describe("deadbandToCelsius helper", () => {
        it("maps guide enum 0–7 to 1.0–4.5 °C in 0.5 steps", () => {
            expect(deadbandToCelsius(0)).toBe(1);
            expect(deadbandToCelsius(1)).toBe(1.5);
            expect(deadbandToCelsius(2)).toBe(2);
            expect(deadbandToCelsius(3)).toBe(2.5);
            expect(deadbandToCelsius(4)).toBe(3);
            expect(deadbandToCelsius(5)).toBe(3.5);
            expect(deadbandToCelsius(6)).toBe(4);
            expect(deadbandToCelsius(7)).toBe(4.5);
        });

        it("returns NaN for out-of-range / non-integer values", () => {
            expect(Number.isNaN(deadbandToCelsius(8))).toBe(true);
            expect(Number.isNaN(deadbandToCelsius(-1))).toBe(true);
            expect(Number.isNaN(deadbandToCelsius(1.5))).toBe(true);
        });
    });

    describe("service reminder enable helper", () => {
        it("treats 1–12 as enabled, 0/13/undefined as disabled", () => {
            expect(isServiceReminderEnabled(1)).toBe(true);
            expect(isServiceReminderEnabled(12)).toBe(true);
            expect(isServiceReminderEnabled(0)).toBe(false);
            expect(isServiceReminderEnabled(13)).toBe(false);
            expect(isServiceReminderEnabled(undefined)).toBe(false);
            expect(isServiceReminderEnabled(null)).toBe(false);
        });
    });

    describe("UI gating helpers (Heat Blast / Away)", () => {
        const allHolds = ["Schedule", "Temporary", "Permanent", "Away", "Vacation"];

        it("filterHoldChoicesForInstaller removes Away when installer disabled", () => {
            expect(filterHoldChoicesForInstaller(allHolds, false)).toEqual([
                "Schedule",
                "Temporary",
                "Permanent",
                "Vacation",
            ]);
        });

        it("filterHoldChoicesForInstaller keeps Away when installer enabled", () => {
            expect(filterHoldChoicesForInstaller(allHolds, true)).toEqual(allHolds);
        });

        it("shouldShowHeatBlastSetting is true only when installer enabled", () => {
            expect(shouldShowHeatBlastSetting(true)).toBe(true);
            expect(shouldShowHeatBlastSetting(false)).toBe(false);
            expect(shouldShowHeatBlastSetting(undefined)).toBe(false);
        });
    });
});
