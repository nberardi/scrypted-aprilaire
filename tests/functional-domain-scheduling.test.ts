/**
 * Functional Domain: Scheduling (0x03)
 *
 * Priority list: P0 Schedule Hold buffer/date/month/cool decode
 */
import { describe, expect, it } from "vitest";
import {
    AwaySettingsRequest,
    AwaySettingsResponse,
    HeatBlastRequest,
    HeatBlastResponse,
    HoldType,
    ScheduleHoldRequest,
    ScheduleHoldResponse,
} from "../src/FunctionalDomainScheduling";
import { FanModeSetting } from "../src/FunctionalDomainControl";
import {
    FunctionalDomain,
    FunctionalDomainScheduling,
} from "../src/AprilaireClient";
import {
    AWAY_COOL_INDEX_TO_C,
    AWAY_HEAT_INDEX_TO_C,
    GuideAttribute,
    GuideDomain,
    SCHEDULE_HOLD_DATA_BYTE_COUNT,
    guideDecodeTemperature,
    guideEncodeTemperature,
} from "./helpers/guide-reference";

describe("Scheduling domainx", () => {
    describe(" Away Settings", () => {
        it("parses indexed heat/cool maps ", () => {
            for (const [index, celsius] of Object.entries(AWAY_HEAT_INDEX_TO_C)) {
                const payload = Buffer.from([
                    FanModeSetting.Auto,
                    Number(index),
                    0, // cool index 0 = 26.5
                ]);
                const res = new AwaySettingsResponse(payload);
                expect(res.heatSetpoint).toBe(celsius);
                expect(res.coolSetpoint).toBe(26.5);
                expect(res.fan).toBe(FanModeSetting.Auto);
            }

            for (const [index, celsius] of Object.entries(AWAY_COOL_INDEX_TO_C)) {
                const payload = Buffer.from([FanModeSetting.On, 0, Number(index)]);
                const res = new AwaySettingsResponse(payload);
                expect(res.coolSetpoint).toBe(celsius);
            }
        });

        it("serializes only valid guide index temperatures", () => {
            const req = new AwaySettingsRequest();
            req.fan = FanModeSetting.Auto;
            req.heatSetpoint = 16.5;
            req.coolSetpoint = 29.5;
            const buf = req.toBuffer();
            expect(buf.length).toBe(3);
            expect(buf[0]).toBe(FanModeSetting.Auto);
            expect(buf[1]).toBe(2); // 16.5 °C
            expect(buf[2]).toBe(5); // 29.5 °C
            expect(req.attribute).toBe(GuideAttribute.Scheduling.AwaySettings);
        });

        it("rejects heat/cool outside documented away ranges", () => {
            const req = new AwaySettingsRequest();
            req.fan = FanModeSetting.Auto;
            req.heatSetpoint = 20; // not in 15.5–18.5 table
            req.coolSetpoint = 26.5;
            expect(() => req.toBuffer()).toThrow();
        });
    });

    describe(" Schedule Hold ", () => {
        it("binds to Scheduling / attribute 0x04", () => {
            const req = new ScheduleHoldRequest();
            expect(req.domain).toBe(GuideDomain.Scheduling);
            expect(req.attribute).toBe(GuideAttribute.Scheduling.ScheduleHold);
            expect(req.attribute).toBe(FunctionalDomainScheduling.ScheduleHold);
        });

        it("maps hold types: Disabled/Temporary/Permanent/Away/Vacation", () => {
            expect(HoldType.Disabled).toBe(0);
            expect(HoldType.Temporary).toBe(1);
            expect(HoldType.Permanent).toBe(2);
            expect(HoldType.Away).toBe(3);
            expect(HoldType.Vacation).toBe(4);
        });

        it("serializes a 10-byte hold payload (protocolbytes 0–9)", () => {
            const req = new ScheduleHoldRequest();
            req.hold = HoldType.Vacation;
            req.fan = FanModeSetting.Auto;
            req.heatSetpoint = 18;
            req.coolSetpoint = 28;
            req.dehumidifierSetpoint = 55;
            // 2026-07-18 14:30 local components as guide fields
            req.endDate = new Date(2026, 6, 18, 14, 30, 0); // month 6 = July

            const buf = req.toBuffer();
            expect(buf.length).toBe(SCHEDULE_HOLD_DATA_BYTE_COUNT);
            expect(buf[0]).toBe(HoldType.Vacation);
            expect(buf[1]).toBe(FanModeSetting.Auto);
            expect(buf[2]).toBe(guideEncodeTemperature(18));
            expect(buf[3]).toBe(guideEncodeTemperature(28));
            expect(buf[4]).toBe(55);
            expect(buf[5]).toBe(30); // minute
            expect(buf[6]).toBe(14); // hour
            expect(buf[7]).toBe(18); // day of month 1–31 (NOT weekday)
            expect(buf[8]).toBe(7); // month 1–12 (NOT 0–11)
            expect(buf[9]).toBe(26); // year - 2000
        });

        it("serializes disabled hold with null fields", () => {
            const req = new ScheduleHoldRequest();
            req.hold = HoldType.Disabled;
            // other fields intentionally unset / zero
            const buf = req.toBuffer();
            expect(buf.length).toBe(SCHEDULE_HOLD_DATA_BYTE_COUNT);
            expect(buf[0]).toBe(HoldType.Disabled);
        });

        it("parses hold response with correct domain and cool setpoint decode", () => {
            const payload = Buffer.from([
                HoldType.Temporary,
                FanModeSetting.On,
                guideEncodeTemperature(20),
                guideEncodeTemperature(25.5),
                0, // DEH off
                0, // minute
                12, // hour
                15, // day
                3, // month
                26, // year
            ]);
            const res = new ScheduleHoldResponse(payload);

            expect(res.domain).toBe(FunctionalDomain.Scheduling);
            expect(res.attribute).toBe(GuideAttribute.Scheduling.ScheduleHold);
            expect(res.hold).toBe(HoldType.Temporary);
            expect(res.fan).toBe(FanModeSetting.On);
            expect(res.heatSetpoint).toBe(20);
            // Cool must be decoded as temperature, not re-encoded
            expect(res.coolSetpoint).toBe(25.5);
            expect(res.coolSetpoint).toBe(guideDecodeTemperature(payload[3]));
            expect(res.endDate.getFullYear()).toBe(2026);
            expect(res.endDate.getMonth()).toBe(2); // JS month 0-based for March
            expect(res.endDate.getDate()).toBe(15);
            expect(res.endDate.getHours()).toBe(12);
        });
    });

    describe(" Heat Blast", () => {
        it("writes 0=OFF / 1=ON", () => {
            const off = new HeatBlastRequest();
            off.heatBlast = false;
            expect(off.toBuffer()).toEqual(Buffer.from([0]));
            expect(off.attribute).toBe(GuideAttribute.Scheduling.HeatBlast);

            const on = new HeatBlastRequest();
            on.heatBlast = true;
            expect(on.toBuffer()).toEqual(Buffer.from([1]));
        });

        it("parses heat blast state and uses Scheduling domain", () => {
            const res = new HeatBlastResponse(Buffer.from([1]));
            expect(res.heatBlast).toBe(true);
            expect(res.domain).toBe(FunctionalDomain.Scheduling);
            expect(res.attribute).toBe(GuideAttribute.Scheduling.HeatBlast);
        });
    });
});
