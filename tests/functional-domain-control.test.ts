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
} from "../src/FunctionalDomainControl";
import {
    FunctionalDomain,
    FunctionalDomainControl,
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
});
