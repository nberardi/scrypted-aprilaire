/**
 * Functional Domain: Control (0x02)
 */
import { describe, expect, it } from "vitest";
import {
    AirCleaningSettingsResponse,
    DehumidificationSetpointRequest,
    DehumidificationSetpointResponse,
    FanModeSetting,
    FreshAirSettingsResponse,
    HumidificationSetpointRequest,
    HumidificationSetpointResponse,
    HumidificationState,
    ThermostatAndIAQAvailableResponse,
    ThermostatCapabilities,
    ThermostatMode,
    ThermostatSetpointAndModeSettingsRequest,
    ThermostatSetpointAndModeSettingsResponse,
    enforceDeadband,
} from "../src/FunctionalDomainControl";
import {
    DEFAULT_DEADBAND_C,
    deadbandIndexToCelsius,
} from "../src/FunctionalDomainSetup";
import {
    FunctionalDomain,
    FunctionalDomainControl,
    convertTemperatureToByte,
} from "../src/AprilaireClient";
import {
    GuideAttribute,
    GuideDomain,
    guideEncodeTemperature,
} from "./helpers/guide-reference";

describe("Control domainx", () => {
    describe(" Thermostat Setpoint & Mode Settings", () => {
        it("binds domain/attribute to Control / 0x01", () => {
            const req = new ThermostatSetpointAndModeSettingsRequest();
            expect(req.domain).toBe(GuideDomain.Control);
            expect(req.attribute).toBe(GuideAttribute.Control.ThermostatSetpointAndModeSettings);
            expect(req.domain).toBe(FunctionalDomain.Control);
            expect(req.attribute).toBe(FunctionalDomainControl.ThermstateSetpointAndModeSettings);
        });

        it("serializes protocolexample: Null mode, Fan On, Heat 21.0, Cool 26.5", () => {
            const req = new ThermostatSetpointAndModeSettingsRequest();
            req.mode = ThermostatMode.Null;
            req.fan = FanModeSetting.On;
            req.heatSetpoint = 21.0;
            req.coolSetpoint = 26.5;

            const buf = req.toBuffer();
            expect(buf.length).toBe(4);
            expect(buf[0]).toBe(0x00); // mode null
            expect(buf[1]).toBe(0x01); // fan on
            expect(buf[2]).toBe(0x15); // 21.0 °C
            expect(buf[3]).toBe(0x5a); // 26.5 °C
        });

        it("uses 0 (Null) for unset setpoints so fields are not modified", () => {
            const req = new ThermostatSetpointAndModeSettingsRequest();
            req.mode = ThermostatMode.Heat;
            // heat/cool left at default 0
            const buf = req.toBuffer();
            expect(buf[0]).toBe(ThermostatMode.Heat);
            expect(buf[2]).toBe(0);
            expect(buf[3]).toBe(0);
        });

        it("parses ReadResponse/COS payload for setpoints and modes", () => {
            const payload = Buffer.from([
                ThermostatMode.Auto, // 5
                FanModeSetting.Auto, // 2
                guideEncodeTemperature(20),
                guideEncodeTemperature(24.5),
            ]);
            const res = new ThermostatSetpointAndModeSettingsResponse(payload);
            expect(res.mode).toBe(ThermostatMode.Auto);
            expect(res.fan).toBe(FanModeSetting.Auto);
            expect(res.heatSetpoint).toBe(20);
            expect(res.coolSetpoint).toBe(24.5);
            expect(res.domain).toBe(FunctionalDomain.Control);
        });

        it("maps mode enum values", () => {
            expect(ThermostatMode.Null).toBe(0);
            expect(ThermostatMode.Off).toBe(1);
            expect(ThermostatMode.Heat).toBe(2);
            expect(ThermostatMode.Cool).toBe(3);
            expect(ThermostatMode.EmergencyHeat).toBe(4);
            expect(ThermostatMode.Auto).toBe(5);
        });

        it("maps fan modes", () => {
            expect(FanModeSetting.Null).toBe(0);
            expect(FanModeSetting.On).toBe(1);
            expect(FanModeSetting.Auto).toBe(2);
            expect(FanModeSetting.Circulate).toBe(3);
        });
    });

    describe(" Dehumidification Setpoint", () => {
        it("writes 0 for Off and 40–90 for %RH", () => {
            const off = new DehumidificationSetpointRequest();
            off.on = false;
            off.dehumidificationSetpoint = 55;
            expect(off.toBuffer()[0]).toBe(0);

            const on = new DehumidificationSetpointRequest();
            on.on = true;
            on.dehumidificationSetpoint = 55;
            expect(on.toBuffer()[0]).toBe(55);
            expect(on.attribute).toBe(GuideAttribute.Control.DehumidificationSetpoint);
        });

        it("parses response: 0 = off, non-zero = on with setpoint", () => {
            const off = new DehumidificationSetpointResponse(Buffer.from([0]));
            expect(off.on).toBe(false);
            expect(off.dehumidificationSetpoint).toBe(0);

            const on = new DehumidificationSetpointResponse(Buffer.from([50]));
            expect(on.on).toBe(true);
            expect(on.dehumidificationSetpoint).toBe(50);
        });
    });

    describe(" Humidification Setpoint", () => {
        it("writes 0 for Off; manual range 10–50 %RH", () => {
            const on = new HumidificationSetpointRequest();
            on.on = true;
            on.humidificationSetpoint = 35;
            expect(on.toBuffer()[0]).toBe(35);
            expect(on.attribute).toBe(GuideAttribute.Control.HumidificationSetpoint);
        });

        it("parses response", () => {
            const res = new HumidificationSetpointResponse(Buffer.from([40]));
            expect(res.on).toBe(true);
            expect(res.humidificationSetpoint).toBe(40);
        });
    });

    describe(" Fresh Air Setting", () => {
        it("parses mode and event bytes", () => {
            // Mode: 0 Off, 1 Automatic; Event: 0 Off, 2 = 3hr, 3 = 24hr
            const res = new FreshAirSettingsResponse(Buffer.from([1, 2]));
            expect(res.mode).toBe(1);
            expect(res.event).toBe(2);
            expect(res.attribute).toBe(GuideAttribute.Control.FreshAirSetting);
        });
    });

    describe(" Air Cleaning Settings", () => {
        it("parses mode and event bytes", () => {
            // Mode: 0 Off, 1 Constant, 2 Auto; Event: 0 Off, 3 = 3hr, 4 = 24hr
            const res = new AirCleaningSettingsResponse(Buffer.from([2, 4]));
            expect(res.mode).toBe(2);
            expect(res.event).toBe(4);
            expect(res.attribute).toBe(GuideAttribute.Control.AirCleaningSetting);
        });
    });

    describe(" Thermostat/IAQ Available", () => {
        it("parses capability bytes per protocol table", () => {
            // Heat+EmHeat+Cool+Auto, air clean yes, vent yes, dehum yes, hum manual
            const payload = Buffer.from([
                ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto, // 6
                1,
                1,
                1,
                HumidificationState.Manual, // 2
            ]);
            const res = new ThermostatAndIAQAvailableResponse(payload);
            expect(res.thermostat).toBe(6);
            expect(res.airCleaning).toBe(true);
            expect(res.freshAirVentilation).toBe(true);
            expect(res.dehumidification).toBe(true);
            expect(res.humidification).toBe(HumidificationState.Manual);
            expect(res.attribute).toBe(GuideAttribute.Control.ThermostatAndIAQAvailable);
        });

        it("maps thermostat capability enum 1–6", () => {
            expect(ThermostatCapabilities.Heat).toBe(1);
            expect(ThermostatCapabilities.Cool).toBe(2);
            expect(ThermostatCapabilities.HeatAndCool).toBe(3);
            expect(ThermostatCapabilities.HeatEmergencyHeatAndCool).toBe(4);
            expect(ThermostatCapabilities.HeatCoolAndAuto).toBe(5);
            expect(ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto).toBe(6);
        });

        it("maps humidification availability: None / Auto / Manual", () => {
            expect(HumidificationState.NotAvailable).toBe(0);
            expect(HumidificationState.Auto).toBe(1);
            expect(HumidificationState.Manual).toBe(2);
        });
    });

    /**
     * Deadband enforcement (§J.6 / §2.1).
     *
     * Protocol temperatures are always °C. Guide example is in °F:
     *   Heat 70°F ≈ 21.0°C, Cool 73°F ≈ 22.5°C, deadband 3°F ≈ 1.5°C
     *   (installer index 1 = "3F or 1.5C"). Lowering cool to 72°F ≈ 22.0°C
     *   requires heat → 20.5°C (≈69°F) when cool is preserved.
     */
    describe(" enforceDeadband (Auto heat/cool separation)", () => {
        it("leaves setpoints unchanged when separation already ≥ deadband", () => {
            // 22.5 − 21.0 = 1.5 ≥ 1.5
            const result = enforceDeadband(21.0, 22.5, 1.5, "both");
            expect(result.heatSetpoint).toBe(21.0);
            expect(result.coolSetpoint).toBe(22.5);
            expect(result.adjusted).toBe(false);
        });

        it("guide example: lower cool to 22.0°C preserves cool, drops heat to 20.5°C", () => {
            // Starting pair: heat 21.0 / cool 22.5 / deadband 1.5 (valid).
            // User lowers cool → 22.0; preserve cool → heat = 22.0 − 1.5 = 20.5.
            const result = enforceDeadband(21.0, 22.0, 1.5, "cool");
            expect(result.heatSetpoint).toBe(20.5);
            expect(result.coolSetpoint).toBe(22.0);
            expect(result.adjusted).toBe(true);
            expect(result.coolSetpoint - result.heatSetpoint).toBe(1.5);
        });

        it("preserve heat raises cool when user raises heat into deadband", () => {
            // heat 21.5 / cool 22.5 / deadband 1.5 → sep 1.0 < 1.5
            // preserve heat → cool = 21.5 + 1.5 = 23.0
            const result = enforceDeadband(21.5, 22.5, 1.5, "heat");
            expect(result.heatSetpoint).toBe(21.5);
            expect(result.coolSetpoint).toBe(23.0);
            expect(result.adjusted).toBe(true);
        });

        it("preserve both (dual write) keeps heat and raises cool", () => {
            const result = enforceDeadband(21.0, 21.5, 1.5, "both");
            expect(result.heatSetpoint).toBe(21.0);
            expect(result.coolSetpoint).toBe(22.5);
            expect(result.adjusted).toBe(true);
        });

        it("uses default deadband 1.5°C when omitted", () => {
            expect(DEFAULT_DEADBAND_C).toBe(1.5);
            const result = enforceDeadband(20.0, 21.0); // sep 1.0 < default 1.5
            expect(result.coolSetpoint - result.heatSetpoint).toBe(DEFAULT_DEADBAND_C);
            expect(result.adjusted).toBe(true);
        });

        it("handles wider deadband from installer index (e.g. index 4 = 3.0°C)", () => {
            const deadbandC = deadbandIndexToCelsius(4); // 3.0°C
            expect(deadbandC).toBe(3.0);
            const result = enforceDeadband(20.0, 22.0, deadbandC, "cool");
            // sep 2.0 < 3.0 → heat = 22.0 − 3.0 = 19.0
            expect(result.heatSetpoint).toBe(19.0);
            expect(result.coolSetpoint).toBe(22.0);
            expect(result.coolSetpoint - result.heatSetpoint).toBe(3.0);
        });

        it("enforced dual setpoints serialize to valid Control/1 payload bytes", () => {
            // After enforcement: heat 20.5, cool 22.0 → wire bytes must match encoding.
            const adjusted = enforceDeadband(21.0, 22.0, 1.5, "cool");
            const req = new ThermostatSetpointAndModeSettingsRequest();
            req.mode = ThermostatMode.Auto;
            req.fan = FanModeSetting.Auto;
            req.heatSetpoint = adjusted.heatSetpoint;
            req.coolSetpoint = adjusted.coolSetpoint;

            const buf = req.toBuffer();
            expect(buf[0]).toBe(ThermostatMode.Auto);
            expect(buf[2]).toBe(convertTemperatureToByte(20.5));
            expect(buf[3]).toBe(convertTemperatureToByte(22.0));
            expect(buf[2]).toBe(guideEncodeTemperature(20.5));
            expect(buf[3]).toBe(guideEncodeTemperature(22.0));
            // Separation on the wire equals deadband after round-trip decode path.
            expect(adjusted.coolSetpoint - adjusted.heatSetpoint).toBe(1.5);
        });

        it("concrete numeric matrix: heat/cool/deadband in → expected out", () => {
            const cases: Array<{
                heat: number;
                cool: number;
                deadband: number;
                preserve: "heat" | "cool" | "both";
                expectHeat: number;
                expectCool: number;
                expectAdjusted: boolean;
            }> = [
                { heat: 20, cool: 24, deadband: 1.5, preserve: "both", expectHeat: 20, expectCool: 24, expectAdjusted: false },
                { heat: 21, cool: 22, deadband: 1.5, preserve: "cool", expectHeat: 20.5, expectCool: 22, expectAdjusted: true },
                { heat: 21, cool: 22, deadband: 1.5, preserve: "heat", expectHeat: 21, expectCool: 22.5, expectAdjusted: true },
                { heat: 18, cool: 18.5, deadband: 2.0, preserve: "both", expectHeat: 18, expectCool: 20, expectAdjusted: true },
                { heat: 22.5, cool: 22.5, deadband: 1.0, preserve: "cool", expectHeat: 21.5, expectCool: 22.5, expectAdjusted: true },
            ];

            for (const c of cases) {
                const result = enforceDeadband(c.heat, c.cool, c.deadband, c.preserve);
                expect(result.heatSetpoint).toBe(c.expectHeat);
                expect(result.coolSetpoint).toBe(c.expectCool);
                expect(result.adjusted).toBe(c.expectAdjusted);
                expect(result.coolSetpoint - result.heatSetpoint).toBeGreaterThanOrEqual(c.deadband);
            }
        });
    });
});