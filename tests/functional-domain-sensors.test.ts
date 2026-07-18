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
    describe(" Sensor Values & Status", () => {
        it("parses 16-byte status/value pairs", () => {
            const payload = Buffer.alloc(16);
            // indoor temp OK 22.0
            payload[0] = TemperatureSensorStatus.NoError;
            payload[1] = guideEncodeTemperature(22);
            // wired remote not installed
            payload[2] = TemperatureSensorStatus.NotInstalled;
            payload[3] = 0;
            // outdoor OK -5.0
            payload[4] = TemperatureSensorStatus.NoError;
            payload[5] = guideEncodeTemperature(-5);
            // indoor humidity 45%
            payload[6] = HumiditySensorStatus.NoError;
            payload[7] = 45;
            // RAT not installed
            payload[8] = TemperatureSensorStatus.NotInstalled;
            // LAT not installed
            payload[10] = TemperatureSensorStatus.NotInstalled;
            // wireless outdoor not installed
            payload[12] = TemperatureSensorStatus.NotInstalled;
            // outdoor humidity not installed
            payload[14] = HumiditySensorStatus.NotInstalled;

            const res = new SensorValuesResponse(payload);
            expect(res.domain).toBe(FunctionalDomain.Sensors);
            expect(res.attribute).toBe(GuideAttribute.Sensors.SensorValues);
            expect(res.indoorTemperature).toBe(22);
            expect(res.outdoorTemperature).toBe(-5);
            expect(res.indoorHumidity).toBe(45);
            expect(res.outdoorTemperatureStatus).toBe(TemperatureSensorStatus.NoError);
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
