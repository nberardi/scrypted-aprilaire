/**
 * Functional Domain: Control (0x02)
 */
import { describe, expect, it } from "vitest";
import {
    AirCleaningSettingsResponse,
    DEHUMIDIFICATION_SETPOINT_FALLBACK,
    DEHUMIDIFICATION_SETPOINT_MAX,
    DEHUMIDIFICATION_SETPOINT_MIN,
    DehumidificationSetpointRequest,
    DehumidificationSetpointResponse,
    encodeHumidificationSetpointByte,
    FanModeSetting,
    FreshAirSettingsResponse,
    HUMIDIFICATION_AUTO_SETPOINT_FALLBACK,
    HUMIDIFICATION_AUTO_SETPOINT_MAX,
    HUMIDIFICATION_AUTO_SETPOINT_MIN,
    HUMIDIFICATION_SETPOINT_FALLBACK,
    HUMIDIFICATION_SETPOINT_MAX,
    HUMIDIFICATION_SETPOINT_MIN,
    HumidificationSetpointRequest,
    HumidificationSetpointResponse,
    HumidificationState,
    ThermostatAndIAQAvailableResponse,
    ThermostatCapabilities,
    ThermostatMode,
    ThermostatSetpointAndModeSettingsRequest,
    ThermostatSetpointAndModeSettingsResponse,
    availableScryptedModesForCapabilities,
    enforceDeadband,
    protocolModeFromScrypted,
    ScryptedThermostatMode,
    supportsAutoChangeover,
    supportsEmergencyHeat,
} from "../src/FunctionalDomainControl";
import { ResponseErrorType } from "../src/BasePayloadResponse";
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
            expect(res.window).toBe("manual");
            expect(res.humidificationSetpoint).toBe(40);
            expect(res.autoLevel).toBeUndefined();
        });

        it("treats 1–7 as Auto index, not %RH", () => {
            const res = new HumidificationSetpointResponse(Buffer.from([5]));
            expect(res.on).toBe(true);
            expect(res.window).toBe("auto");
            expect(res.autoLevel).toBe(5);
            expect(res.humidificationSetpoint).toBeUndefined();
        });

        it("does not publish reserved bytes as a setpoint", () => {
            for (const byte of [8, 9, 51, 255]) {
                const res = new HumidificationSetpointResponse(Buffer.from([byte]));
                expect(res.window).toBe("reserved");
                expect(res.on).toBe(false);
                expect(res.humidificationSetpoint).toBeUndefined();
                expect(res.autoLevel).toBeUndefined();
            }
        });

        it("prefers an Auto index over a HomeKit %RH stuffed in humidificationSetpoint", () => {
            const req = new HumidificationSetpointRequest();
            req.on = true;
            req.auto = true;
            req.autoLevel = 3;
            req.humidificationSetpoint = 35;
            expect(req.toBuffer()[0]).toBe(3);
            expect(encodeHumidificationSetpointByte({
                on: true,
                auto: true,
                autoLevel: 6,
                percentRh: 40,
            })).toBe(6);
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

    // §2.7 defines 0 = No and 1 = Yes; 2–255 are reserved. Treating any non-zero
    // byte as Yes publishes IAQ child devices from values the guide does not define.
    describe(" Thermostat & IAQ Available reserved values", () => {
        const availability = (airCleaning: number, freshAir: number, dehumidification: number) =>
            new ThermostatAndIAQAvailableResponse(
                Buffer.from([
                    ThermostatCapabilities.HeatAndCool,
                    airCleaning,
                    freshAir,
                    dehumidification,
                    HumidificationState.NotAvailable,
                ])
            );

        it("reports installed only for the documented value 1", () => {
            const res = availability(1, 1, 1);
            expect(res.airCleaning).toBe(true);
            expect(res.freshAirVentilation).toBe(true);
            expect(res.dehumidification).toBe(true);
        });

        it("reports not installed for 0", () => {
            const res = availability(0, 0, 0);
            expect(res.airCleaning).toBe(false);
            expect(res.freshAirVentilation).toBe(false);
            expect(res.dehumidification).toBe(false);
        });

        it("rejects reserved values 2–255 rather than treating them as Yes", () => {
            for (const reserved of [2, 3, 15, 128, 255]) {
                const res = availability(reserved, reserved, reserved);
                expect(res.airCleaning).toBe(false);
                expect(res.freshAirVentilation).toBe(false);
                expect(res.dehumidification).toBe(false);
            }
        });

        it("marks a short availability payload malformed instead of throwing", () => {
            const res = new ThermostatAndIAQAvailableResponse(Buffer.from([ThermostatCapabilities.Heat, 1]));
            expect(res.responseError).toBe(ResponseErrorType.PayloadMalformed);
            expect(res.humidification).toBe(HumidificationState.NotAvailable);
        });
    });

    // §2.3 / §2.4 carry on/off in the setpoint value itself, so "turn on" with no
    // known setpoint would serialize to 0 — the byte that means Off.
    describe(" IAQ humidity setpoint on/off encoding", () => {
        describe("dehumidification (§2.3, window 40–90)", () => {
            const encode = (on: boolean, setpoint?: number) => {
                const req = new DehumidificationSetpointRequest();
                req.on = on;
                req.dehumidificationSetpoint = setpoint as number;
                return req.toBuffer()[0];
            };

            it("writes 0 for off regardless of the setpoint", () => {
                expect(encode(false, 55)).toBe(0);
                expect(encode(false)).toBe(0);
            });

            it("writes the setpoint when on and known", () => {
                expect(encode(true, 55)).toBe(55);
                expect(encode(true, DEHUMIDIFICATION_SETPOINT_MIN)).toBe(40);
                expect(encode(true, DEHUMIDIFICATION_SETPOINT_MAX)).toBe(90);
            });

            it("falls back into the window when on with no known setpoint", () => {
                for (const unknown of [undefined, 0, NaN]) {
                    const byte = encode(true, unknown);
                    expect(byte).toBe(DEHUMIDIFICATION_SETPOINT_FALLBACK);
                    expect(byte).not.toBe(0);
                }
            });

            it("clamps into the writable window instead of sending a NACK-able byte", () => {
                expect(encode(true, 5)).toBe(DEHUMIDIFICATION_SETPOINT_MIN);
                expect(encode(true, 99)).toBe(DEHUMIDIFICATION_SETPOINT_MAX);
            });
        });

        describe("humidification (§2.4, manual 10–50 / auto 1–7)", () => {
            const encode = (on: boolean, setpoint?: number, auto = false) => {
                const req = new HumidificationSetpointRequest();
                req.on = on;
                req.humidificationSetpoint = setpoint as number;
                req.auto = auto;
                return req.toBuffer()[0];
            };

            it("writes 0 for off", () => {
                expect(encode(false, 35)).toBe(0);
                expect(encode(false, 5, true)).toBe(0);
            });

            it("uses the manual window when humidification is not in Auto", () => {
                expect(encode(true, 35)).toBe(35);
                expect(encode(true, 3)).toBe(HUMIDIFICATION_SETPOINT_MIN);
                expect(encode(true, 80)).toBe(HUMIDIFICATION_SETPOINT_MAX);
                expect(encode(true, undefined)).toBe(HUMIDIFICATION_SETPOINT_FALLBACK);
            });

            it("uses the 1–7 Auto window when the thermostat reports Auto", () => {
                expect(encode(true, 4, true)).toBe(4);
                // %RH must not be clamped into 1–7 (that wrote max Auto for 35%).
                expect(encode(true, 35, true)).toBe(HUMIDIFICATION_AUTO_SETPOINT_FALLBACK);
                expect(encode(true, 35, true)).not.toBe(35);
                expect(encode(true, 35, true)).not.toBe(HUMIDIFICATION_AUTO_SETPOINT_MAX);
                expect(encode(true, undefined, true)).toBe(HUMIDIFICATION_AUTO_SETPOINT_FALLBACK);
                expect(encode(true, 0, true)).toBeGreaterThanOrEqual(HUMIDIFICATION_AUTO_SETPOINT_MIN);
            });

            it("never serializes On as the Off byte", () => {
                for (const auto of [false, true]) {
                    for (const setpoint of [undefined, 0, -5, NaN, 1000]) {
                        expect(encode(true, setpoint, auto)).not.toBe(0);
                    }
                }
            });
        });
    });

    describe("§2.7 capability → Scrypted mode mapping", () => {
        it("offers HeatCool/Auto only when the thermostat lists Auto changeover", () => {
            for (const caps of [
                ThermostatCapabilities.HeatAndCool,
                ThermostatCapabilities.HeatEmergencyHeatAndCool,
            ]) {
                const modes = availableScryptedModesForCapabilities(caps);
                expect(modes).not.toContain(ScryptedThermostatMode.HeatCool);
                expect(modes).not.toContain(ScryptedThermostatMode.Auto);
                expect(supportsAutoChangeover(caps)).toBe(false);
            }

            for (const caps of [
                ThermostatCapabilities.HeatCoolAndAuto,
                ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto,
            ]) {
                const modes = availableScryptedModesForCapabilities(caps);
                expect(modes).toContain(ScryptedThermostatMode.HeatCool);
                expect(modes).toContain(ScryptedThermostatMode.Auto);
                expect(supportsAutoChangeover(caps)).toBe(true);
            }
        });

        it("writes protocol Auto (5) for HeatCool/Auto only when Auto is supported", () => {
            expect(protocolModeFromScrypted(
                ScryptedThermostatMode.HeatCool,
                ThermostatCapabilities.HeatCoolAndAuto
            )).toBe(ThermostatMode.Auto);
            expect(protocolModeFromScrypted(
                ScryptedThermostatMode.Auto,
                ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto
            )).toBe(ThermostatMode.Auto);
            expect(protocolModeFromScrypted(
                ScryptedThermostatMode.HeatCool,
                ThermostatCapabilities.HeatAndCool
            )).toBe(ThermostatMode.Null);
            expect(protocolModeFromScrypted(
                ScryptedThermostatMode.Auto,
                ThermostatCapabilities.HeatEmergencyHeatAndCool
            )).toBe(ThermostatMode.Null);
        });

        it("maps Scrypted On to a supported heat/cool mode instead of illegal Auto", () => {
            expect(protocolModeFromScrypted(
                ScryptedThermostatMode.On,
                ThermostatCapabilities.HeatCoolAndAuto
            )).toBe(ThermostatMode.Auto);
            expect(protocolModeFromScrypted(
                ScryptedThermostatMode.On,
                ThermostatCapabilities.HeatAndCool
            )).toBe(ThermostatMode.Heat);
            expect(protocolModeFromScrypted(
                ScryptedThermostatMode.On,
                ThermostatCapabilities.Cool
            )).toBe(ThermostatMode.Cool);
        });

        it("exposes Emergency Heat only for capabilities 4 and 6", () => {
            expect(supportsEmergencyHeat(ThermostatCapabilities.HeatEmergencyHeatAndCool)).toBe(true);
            expect(supportsEmergencyHeat(ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto)).toBe(true);
            expect(supportsEmergencyHeat(ThermostatCapabilities.HeatAndCool)).toBe(false);
            expect(supportsEmergencyHeat(ThermostatCapabilities.HeatCoolAndAuto)).toBe(false);
        });
    });
});