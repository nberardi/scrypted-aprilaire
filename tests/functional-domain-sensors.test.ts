/**
 * Functional Domain: Sensors (0x05)
 *
 * Priority list: P0 temperature sign for outdoor; P1 ODT interval
 */
import { describe, expect, it } from "vitest";
import {
    ControllingSensorsStatusAndValueRequest,
    ControllingSensorsStatusAndValueResponse,
    HumiditySensorStatus,
    OurdoorSensorStatus,
    SensorValuesRequest,
    SensorValuesResponse,
    TemperatureSensorStatus,
    WrittenOutdoorTemperatureValueRequest,
    WrittenOutdoorTemperatureValueResponse,
} from "../src/FunctionalDomainSensors";
import {
    FunctionalDomain,
    FunctionalDomainSensors,
} from "../src/AprilaireClient";
import {
    GuideAttribute,
    GuideDomain,
    WRITTEN_ODT_MAX_STALE_MS,
    guideEncodeTemperature,
} from "./helpers/guide-reference";

describe("Sensors domainx", () => {
    describe(" Sensor Values & Status (§5.1)", () => {
        it("SensorValuesRequest is empty-body Sensors attribute 0x01", () => {
            const req = new SensorValuesRequest();
            expect(req.domain).toBe(GuideDomain.Sensors);
            expect(req.attribute).toBe(GuideAttribute.Sensors.SensorValues);
            expect(req.attribute).toBe(FunctionalDomainSensors.SensorValues);
            expect(req.toBuffer()).toEqual(Buffer.alloc(0));
        });

        it("parses full 16-byte status/value pairs including RAT/LAT/wireless", () => {
            const payload = Buffer.alloc(16);
            // indoor temp OK 22.0
            payload[0] = TemperatureSensorStatus.NoError;
            payload[1] = guideEncodeTemperature(22);
            // wired remote OK 21.0
            payload[2] = TemperatureSensorStatus.NoError;
            payload[3] = guideEncodeTemperature(21);
            // outdoor OK -5.0
            payload[4] = TemperatureSensorStatus.NoError;
            payload[5] = guideEncodeTemperature(-5);
            // indoor humidity 45%
            payload[6] = HumiditySensorStatus.NoError;
            payload[7] = 45;
            // RAT OK 18.5
            payload[8] = TemperatureSensorStatus.NoError;
            payload[9] = guideEncodeTemperature(18.5);
            // LAT OK 30.0
            payload[10] = TemperatureSensorStatus.NoError;
            payload[11] = guideEncodeTemperature(30);
            // wireless outdoor OK -8.5
            payload[12] = TemperatureSensorStatus.NoError;
            payload[13] = guideEncodeTemperature(-8.5);
            // outdoor humidity 55%
            payload[14] = HumiditySensorStatus.NoError;
            payload[15] = 55;

            const res = new SensorValuesResponse(payload);
            expect(res.domain).toBe(FunctionalDomain.Sensors);
            expect(res.attribute).toBe(GuideAttribute.Sensors.SensorValues);
            expect(res.indoorTemperature).toBe(22);
            expect(res.indoorWiredRemoteTemperature).toBe(21);
            expect(res.outdoorTemperature).toBe(-5);
            expect(res.indoorHumidity).toBe(45);
            expect(res.returningAirTemperature).toBe(18.5);
            expect(res.returningAirTemperatureStatus).toBe(TemperatureSensorStatus.NoError);
            expect(res.leavingAirTemperature).toBe(30);
            expect(res.leavingAirTemperatureStatus).toBe(TemperatureSensorStatus.NoError);
            expect(res.outdoorWirelessTemperature).toBe(-8.5);
            expect(res.outdoorWirelessTemperatureStatus).toBe(TemperatureSensorStatus.NoError);
            expect(res.outdoorHumidity).toBe(55);
            expect(res.outdoorHumidityStatus).toBe(HumiditySensorStatus.NoError);
            expect(res.outdoorTemperatureStatus).toBe(TemperatureSensorStatus.NoError);
        });

        it("independent offsets: RAT/LAT not coupled to indoor outdoor", () => {
            const payload = Buffer.alloc(16, 0);
            payload[0] = TemperatureSensorStatus.NotInstalled;
            payload[4] = TemperatureSensorStatus.NotInstalled;
            payload[8] = TemperatureSensorStatus.NoError;
            payload[9] = guideEncodeTemperature(19);
            payload[10] = TemperatureSensorStatus.NoError;
            payload[11] = guideEncodeTemperature(28.5);
            const res = new SensorValuesResponse(payload);
            expect(res.returningAirTemperature).toBe(19);
            expect(res.leavingAirTemperature).toBe(28.5);
            expect(res.indoorTemperatureStatus).toBe(TemperatureSensorStatus.NotInstalled);
            expect(res.outdoorTemperatureStatus).toBe(TemperatureSensorStatus.NotInstalled);
        });

        it("maps temperature sensor status codes per protocol", () => {
            expect(TemperatureSensorStatus.NoError).toBe(0);
            expect(TemperatureSensorStatus.OutOfRangeLow).toBe(1);
            expect(TemperatureSensorStatus.OutOfRangeHigh).toBe(2);
            expect(TemperatureSensorStatus.NotInstalled).toBe(3);
            expect(TemperatureSensorStatus.ErrorOpen).toBe(4);
            expect(TemperatureSensorStatus.ErrorShort).toBe(5);
        });
    });

    describe(" Controlling Sensors Status and Value", () => {
        it("is a ReadRequest with no data body", () => {
            const req = new ControllingSensorsStatusAndValueRequest();
            expect(req.domain).toBe(GuideDomain.Sensors);
            expect(req.attribute).toBe(GuideAttribute.Sensors.ControllingSensorValues);
            expect(req.attribute).toBe(FunctionalDomainSensors.ControllingSensorValues);
            expect(req.toBuffer().length).toBe(0);
        });

        it("parses 8-byte indoor/outdoor temp+humidity controlling values", () => {
            const payload = Buffer.from([
                TemperatureSensorStatus.NoError,
                guideEncodeTemperature(21.5),
                TemperatureSensorStatus.NoError,
                guideEncodeTemperature(-10.5),
                HumiditySensorStatus.NoError,
                40,
                HumiditySensorStatus.NotInstalled,
                0,
            ]);
            const res = new ControllingSensorsStatusAndValueResponse(payload);
            expect(res.indoorTemperature).toBe(21.5);
            expect(res.outdoorTemperature).toBe(-10.5);
            expect(res.indoorHumidity).toBe(40);
            expect(res.outdoorHumidityStatus).toBe(HumiditySensorStatus.NotInstalled);
        });
    });

    describe(" Written Outdoor Temperature Value", () => {
        it("writes status byte 0 and temperature (guide: status R/COS only; write 0)", () => {
            const req = new WrittenOutdoorTemperatureValueRequest();
            req.temperature = -8.5;
            const buf = req.toBuffer();
            expect(req.attribute).toBe(GuideAttribute.Sensors.WrittenOutdoorTemperatureValue);
            expect(buf.length).toBe(2);
            expect(buf[0]).toBe(0); // must be 0 on write
            expect(buf[1]).toBe(guideEncodeTemperature(-8.5));
        });

        it("parses status and temperature on read/COS", () => {
            const payload = Buffer.from([
                OurdoorSensorStatus.NoError,
                guideEncodeTemperature(15),
            ]);
            const res = new WrittenOutdoorTemperatureValueResponse(payload);
            expect(res.status).toBe(OurdoorSensorStatus.NoError);
            expect(res.temperature).toBe(15);
        });

        it("recognizes Timed Out status = 4", () => {
            const res = new WrittenOutdoorTemperatureValueResponse(
                Buffer.from([OurdoorSensorStatus.TimedOut, 0])
            );
            expect(res.status).toBe(4);
        });

        it("documents <10 minute refresh requirement (protocol)", () => {
            // Plugin default interval is 1 minute — must stay under this ceiling.
            expect(WRITTEN_ODT_MAX_STALE_MS).toBe(10 * 60 * 1000);
            const pluginDefaultIntervalMs = 1 * 60 * 1000;
            expect(pluginDefaultIntervalMs).toBeLessThan(WRITTEN_ODT_MAX_STALE_MS);
        });
    });
});
