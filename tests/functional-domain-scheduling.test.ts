/**
 * Functional Domain: Scheduling (0x03)
 *
 * Priority list: P0 Schedule Hold buffer/date/month/cool decode
 *                P1.5 setHold UX mapping → request buffers (#18)
 */
import { describe, expect, it } from "vitest";
import {
    AwaySettingsRequest,
    AwaySettingsResponse,
    buildScheduleHoldRequest,
    HeatBlastRequest,
    HeatBlastResponse,
    HOLD_UI,
    holdTypeToUiValue,
    holdUiValueToHoldType,
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

        it("snaps in-range off-grid setpoints to the nearest wire index", () => {
            // Valid range but between table entries (e.g. unit-converted UI values)
            const cases: Array<[number, number, number, number]> = [
                // [heat °C, cool °C, expected heat index, expected cool index]
                [15.7, 26.6, 0, 0],   // nearest 15.5 / 26.5
                [16.2, 27.2, 1, 1],   // nearest 16 / 27
                [18, 28, 5, 3],       // ties round up: 18.5 / 28.5 (legacy map behavior)
                [18.4, 29.1, 5, 4],   // nearest 18.5 / 29
            ];
            for (const [heat, cool, heatIndex, coolIndex] of cases) {
                const req = new AwaySettingsRequest();
                req.fan = FanModeSetting.Auto;
                req.heatSetpoint = heat;
                req.coolSetpoint = cool;
                const buf = req.toBuffer();
                expect(buf[1]).toBe(heatIndex);
                expect(buf[2]).toBe(coolIndex);
            }
        });

        it("rejects undefined/NaN setpoints instead of writing garbage", () => {
            const req = new AwaySettingsRequest();
            req.fan = FanModeSetting.Auto;
            // setpoints left undefined
            expect(() => req.toBuffer()).toThrow();
        });

        it("clamps out-of-range wire indices when parsing (never undefined)", () => {
            const res = new AwaySettingsResponse(Buffer.from([FanModeSetting.Auto, 9, 250]));
            expect(res.heatSetpoint).toBe(18.5);
            expect(res.coolSetpoint).toBe(29.5);
        });

        it("stamps responses with a numeric timestamp", () => {
            const before = Date.now();
            const res = new AwaySettingsResponse(Buffer.from([FanModeSetting.Auto, 0, 0]));
            expect(typeof res.timestamp).toBe("number");
            expect(res.timestamp).toBeGreaterThanOrEqual(before);
            expect(res.timestamp).toBeLessThanOrEqual(Date.now());
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

        it("serializes disabled hold with null fields (all zeros)", () => {
            const req = new ScheduleHoldRequest();
            req.hold = HoldType.Disabled;
            // other fields intentionally unset / zero
            const buf = req.toBuffer();
            expect(buf.length).toBe(SCHEDULE_HOLD_DATA_BYTE_COUNT);
            expect(buf[0]).toBe(HoldType.Disabled);
            // Cancel: fan, temps, DEH, and end-date components must be Null (0)
            expect(Array.from(buf)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        });

        it("serializes Temporary hold with end date fields", () => {
            const req = new ScheduleHoldRequest();
            req.hold = HoldType.Temporary;
            req.fan = FanModeSetting.On;
            req.heatSetpoint = 20;
            req.coolSetpoint = 25.5;
            req.dehumidifierSetpoint = 0;
            // 2026-03-15 12:00 local
            req.endDate = new Date(2026, 2, 15, 12, 0, 0);

            const buf = req.toBuffer();
            expect(buf.length).toBe(SCHEDULE_HOLD_DATA_BYTE_COUNT);
            expect(buf[0]).toBe(HoldType.Temporary);
            expect(buf[1]).toBe(FanModeSetting.On);
            expect(buf[2]).toBe(guideEncodeTemperature(20));
            expect(buf[3]).toBe(guideEncodeTemperature(25.5));
            expect(buf[4]).toBe(0);
            expect(buf[5]).toBe(0);  // minute
            expect(buf[6]).toBe(12); // hour
            expect(buf[7]).toBe(15); // day of month
            expect(buf[8]).toBe(3);  // month 1–12
            expect(buf[9]).toBe(26); // year − 2000
        });

        it("serializes Permanent hold with setpoints/fan and no end date", () => {
            const req = new ScheduleHoldRequest();
            req.hold = HoldType.Permanent;
            req.fan = FanModeSetting.Auto;
            req.heatSetpoint = 21;
            req.coolSetpoint = 24;
            // endDate intentionally omitted → zeros

            const buf = req.toBuffer();
            expect(buf.length).toBe(SCHEDULE_HOLD_DATA_BYTE_COUNT);
            expect(buf[0]).toBe(HoldType.Permanent);
            expect(buf[1]).toBe(FanModeSetting.Auto);
            expect(buf[2]).toBe(guideEncodeTemperature(21));
            expect(buf[3]).toBe(guideEncodeTemperature(24));
            expect(buf[4]).toBe(0);
            expect(buf[5]).toBe(0);
            expect(buf[6]).toBe(0);
            expect(buf[7]).toBe(0);
            expect(buf[8]).toBe(0);
            expect(buf[9]).toBe(0);
        });

        it("serializes Away hold with fan + heat/cool setpoints", () => {
            const req = new ScheduleHoldRequest();
            req.hold = HoldType.Away;
            req.fan = FanModeSetting.Auto;
            req.heatSetpoint = 16.5;
            req.coolSetpoint = 28.5;
            req.dehumidifierSetpoint = 50;

            const buf = req.toBuffer();
            expect(buf.length).toBe(SCHEDULE_HOLD_DATA_BYTE_COUNT);
            expect(buf[0]).toBe(HoldType.Away);
            expect(buf[1]).toBe(FanModeSetting.Auto);
            expect(buf[2]).toBe(guideEncodeTemperature(16.5));
            expect(buf[3]).toBe(guideEncodeTemperature(28.5));
            expect(buf[4]).toBe(50);
            // Away has no required end date → Null date fields
            expect(buf[5]).toBe(0);
            expect(buf[6]).toBe(0);
            expect(buf[7]).toBe(0);
            expect(buf[8]).toBe(0);
            expect(buf[9]).toBe(0);
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

    describe("setHold UI → ScheduleHoldRequest mapping (#18)", () => {
        it("maps UI strings to HoldType bidirectionally", () => {
            expect(holdUiValueToHoldType(HOLD_UI.Schedule)).toBe(HoldType.Disabled);
            expect(holdUiValueToHoldType(HOLD_UI.Temporary)).toBe(HoldType.Temporary);
            expect(holdUiValueToHoldType(HOLD_UI.Permanent)).toBe(HoldType.Permanent);
            expect(holdUiValueToHoldType(HOLD_UI.Away)).toBe(HoldType.Away);
            expect(holdUiValueToHoldType(HOLD_UI.Vacation)).toBe(HoldType.Vacation);
            expect(holdUiValueToHoldType("not-a-hold")).toBeUndefined();

            expect(holdTypeToUiValue(HoldType.Disabled)).toBe(HOLD_UI.Schedule);
            expect(holdTypeToUiValue(HoldType.Temporary)).toBe(HOLD_UI.Temporary);
            expect(holdTypeToUiValue(HoldType.Permanent)).toBe(HOLD_UI.Permanent);
            expect(holdTypeToUiValue(HoldType.Away)).toBe(HOLD_UI.Away);
            expect(holdTypeToUiValue(HoldType.Vacation)).toBe(HOLD_UI.Vacation);
        });

        it("cancel (Schedule) → Disabled + all-zero buffer", () => {
            // Even if options are passed, cancel must ignore them
            const req = buildScheduleHoldRequest(HOLD_UI.Schedule, {
                fan: FanModeSetting.On,
                heatSetpoint: 20,
                coolSetpoint: 25,
                dehumidifierSetpoint: 55,
                endDate: new Date(2026, 6, 18, 14, 30),
            });
            const buf = req.toBuffer();
            expect(req.hold).toBe(HoldType.Disabled);
            expect(buf).toEqual(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        });

        it("Temporary with end date → correct minute/hour/day/month/year-2000 bytes", () => {
            const endDate = new Date(2026, 6, 18, 14, 30, 0); // Jul 18 2026 14:30
            const req = buildScheduleHoldRequest(HOLD_UI.Temporary, {
                fan: FanModeSetting.Auto,
                heatSetpoint: 20,
                coolSetpoint: 25.5,
                endDate,
            });
            const buf = req.toBuffer();

            expect(buf.length).toBe(SCHEDULE_HOLD_DATA_BYTE_COUNT);
            expect(buf[0]).toBe(HoldType.Temporary);
            expect(buf[1]).toBe(FanModeSetting.Auto);
            expect(buf[2]).toBe(guideEncodeTemperature(20));
            expect(buf[3]).toBe(guideEncodeTemperature(25.5));
            expect(buf[4]).toBe(0);
            expect(buf[5]).toBe(30);
            expect(buf[6]).toBe(14);
            expect(buf[7]).toBe(18);
            expect(buf[8]).toBe(7);
            expect(buf[9]).toBe(26);
        });

        it("Permanent → setpoints/fan, null end date", () => {
            const req = buildScheduleHoldRequest(HOLD_UI.Permanent, {
                fan: FanModeSetting.On,
                heatSetpoint: 19,
                coolSetpoint: 23,
            });
            const buf = req.toBuffer();

            expect(buf[0]).toBe(HoldType.Permanent);
            expect(buf[1]).toBe(FanModeSetting.On);
            expect(buf[2]).toBe(guideEncodeTemperature(19));
            expect(buf[3]).toBe(guideEncodeTemperature(23));
            expect(buf.slice(5)).toEqual(Buffer.from([0, 0, 0, 0, 0]));
        });

        it("Away payload includes required fan + heat/cool fields", () => {
            const req = buildScheduleHoldRequest(HOLD_UI.Away, {
                fan: FanModeSetting.Auto,
                heatSetpoint: 17,
                coolSetpoint: 28.5,
                dehumidifierSetpoint: 45,
            });
            const buf = req.toBuffer();

            expect(Array.from(buf)).toEqual([
                HoldType.Away,
                FanModeSetting.Auto,
                guideEncodeTemperature(17),
                guideEncodeTemperature(28.5),
                45,
                0, 0, 0, 0, 0, // no end date for Away
            ]);
        });

        it("Vacation payload includes setpoints and end date fields", () => {
            const endDate = new Date(2026, 11, 25, 9, 15, 0); // Dec 25 2026 09:15
            const req = buildScheduleHoldRequest(HOLD_UI.Vacation, {
                fan: FanModeSetting.Auto,
                heatSetpoint: 18,
                coolSetpoint: 28,
                dehumidifierSetpoint: 55,
                endDate,
            });
            const buf = req.toBuffer();

            expect(buf[0]).toBe(HoldType.Vacation);
            expect(buf[1]).toBe(FanModeSetting.Auto);
            expect(buf[2]).toBe(guideEncodeTemperature(18));
            expect(buf[3]).toBe(guideEncodeTemperature(28));
            expect(buf[4]).toBe(55);
            expect(buf[5]).toBe(15); // minute
            expect(buf[6]).toBe(9);  // hour
            expect(buf[7]).toBe(25); // day
            expect(buf[8]).toBe(12); // month
            expect(buf[9]).toBe(26); // year − 2000
        });

        it("rejects unknown UI hold values", () => {
            expect(() => buildScheduleHoldRequest("HoldForever")).toThrow(/Unknown hold UI value/);
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
