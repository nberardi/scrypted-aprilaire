/**
 * Functional Domain: Setup (0x01),
 */
import { describe, expect, it } from "vitest";
import {
    DateAndTimeRequest,
    DateAndTimeResponse,
    OutdoorSensorStatus,
    ScaleRequest,
    ScaleResponse,
    TemperatureScale,
    ThermostatInstallerSettingsResponse,
} from "../src/FunctionalDomainSetup";
import { FunctionalDomain, FunctionalDomainSetup } from "../src/AprilaireClient";
import {
    DATE_AND_TIME_DATA_BYTE_COUNT,
    GuideAttribute,
    GuideDomain,
    guideEncodeDateAndTime,
} from "./helpers/guide-reference";

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

    describe(" Date and Time (Setup §1.4 / attribute 0x04)", () => {
        it("binds to Setup / attribute 0x04", () => {
            const req = new DateAndTimeRequest();
            expect(req.domain).toBe(GuideDomain.Setup);
            expect(req.domain).toBe(FunctionalDomain.Setup);
            expect(req.attribute).toBe(GuideAttribute.Setup.DateAndTime);
            expect(req.attribute).toBe(FunctionalDomainSetup.DateAndTime);
            expect(req.attribute).toBe(0x04);
        });

        it("serializes a 7-byte payload: sec,min,hour,date,day,month,year−2000", () => {
            // Synthetic local wall-clock: 2026-07-18 (Saturday) 14:30:45
            // JS Date month is 0-based → 6 = July; getDay() Saturday = 6
            const local = new Date(2026, 6, 18, 14, 30, 45);
            expect(local.getDay()).toBe(6); // Saturday

            const req = DateAndTimeRequest.fromLocalDate(local);
            const buf = req.toBuffer();

            // Independent oracle (guide-reference), not a copy of production encode
            const expected = guideEncodeDateAndTime(local);
            expect(buf.length).toBe(DATE_AND_TIME_DATA_BYTE_COUNT);
            expect(buf).toEqual(expected);
            expect(buf).toEqual(Buffer.from([
                45, // second
                30, // minute
                14, // hour (24h)
                18, // date (day of month)
                6,  // day of week (0=Sun … 6=Sat)
                7,  // month 1–12
                26, // year − 2000
            ]));
        });

        it("round-trips synthetic buffer through response fields", () => {
            // Monday 2024-01-01 00:00:00 → day-of-week = 1
            const wire = Buffer.from([
                0,  // second
                0,  // minute
                0,  // hour
                1,  // date
                1,  // Monday
                1,  // January
                24, // 2024
            ]);
            expect(wire.length).toBe(DATE_AND_TIME_DATA_BYTE_COUNT);

            const res = new DateAndTimeResponse(wire);
            expect(res.attribute).toBe(GuideAttribute.Setup.DateAndTime);
            expect(res.second).toBe(0);
            expect(res.minute).toBe(0);
            expect(res.hour).toBe(0);
            expect(res.date).toBe(1);
            expect(res.day).toBe(1);
            expect(res.month).toBe(1);
            expect(res.year).toBe(24);
            expect(res.localDate.getFullYear()).toBe(2024);
            expect(res.localDate.getMonth()).toBe(0); // JS 0-based
            expect(res.localDate.getDate()).toBe(1);
            expect(res.localDate.getHours()).toBe(0);
            expect(res.localDate.getMinutes()).toBe(0);
            expect(res.localDate.getSeconds()).toBe(0);
        });

        it("encodes local components (not UTC) for a fixed local Date", () => {
            // Construct with explicit local Y/M/D/H/M/S so test is timezone-stable.
            const local = new Date(2026, 11, 25, 23, 59, 58); // Dec 25 23:59:58 local
            const buf = DateAndTimeRequest.fromLocalDate(local).toBuffer();
            expect(buf[0]).toBe(58);
            expect(buf[1]).toBe(59);
            expect(buf[2]).toBe(23);
            expect(buf[3]).toBe(25);
            expect(buf[4]).toBe(local.getDay());
            expect(buf[5]).toBe(12);
            expect(buf[6]).toBe(26);
            // Production encode must match local guide oracle (not UTC getters alone).
            expect(buf).toEqual(guideEncodeDateAndTime(local));
            expect(buf[2]).toBe(local.getHours());
            expect(buf[3]).toBe(local.getDate());
            // Document that UTC fields are intentionally not used for wire layout.
            // When host offset ≠ 0, hour or date may differ from UTC; when offset is 0
            // they coincide — either way the wire always carries local components.
            const utcHour = local.getUTCHours();
            const utcDate = local.getUTCDate();
            if (utcHour !== local.getHours() || utcDate !== local.getDate()) {
                expect(buf[2] === utcHour && buf[3] === utcDate).toBe(false);
            }
        });

        it("maps day-of-week 0=Sunday through 6=Saturday", () => {
            // Find a known Sunday and Saturday via local Date construction.
            // 2026-07-19 is a Sunday; 2026-07-18 is a Saturday.
            const sunday = new Date(2026, 6, 19, 12, 0, 0);
            const saturday = new Date(2026, 6, 18, 12, 0, 0);
            expect(sunday.getDay()).toBe(0);
            expect(saturday.getDay()).toBe(6);

            expect(DateAndTimeRequest.fromLocalDate(sunday).toBuffer()[4]).toBe(0);
            expect(DateAndTimeRequest.fromLocalDate(saturday).toBuffer()[4]).toBe(6);
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
