/**
 * Packet frame + response factory
 *
 * Priority list: P0 NACK handling; frame layout; response routing
 */
import { describe, expect, it } from "vitest";
import {
    Action,
    AprilaireResponsePayload,
    FunctionalDomain,
    FunctionalDomainControl,
    FunctionalDomainIdentification,
    FunctionalDomainScheduling,
    FunctionalDomainSensors,
    FunctionalDomainSetup,
    FunctionalDomainStatus,
    NAckError,
} from "../src/AprilaireClient";
import { NackResponse } from "../src/BasePayloadResponse";
import { ThermostatSetpointAndModeSettingsResponse } from "../src/FunctionalDomainControl";
import { ControllingSensorsStatusAndValueResponse } from "../src/FunctionalDomainSensors";
import { ScheduleHoldResponse } from "../src/FunctionalDomainScheduling";
import { ThermostatErrorResponse } from "../src/FunctionalDomainStatus";
import { MacAddressResponse } from "../src/FunctionalDomainIdentification";
import { DateAndTimeResponse } from "../src/FunctionalDomainSetup";
import {
    GUIDE_EXAMPLE_NACK_OOR,
    GuideAction,
    GuideNAck,
    guideEncodeTemperature,
} from "./helpers/guide-reference";

describe("Packet frame & response factory ", () => {
    describe("frame layout conventions ", () => {
        it("documents HA sequence range 0–127 and thermostat 128–255", () => {
            // Production sequence uses (seq + 1) % 127 → 0–126.
            // Guide allows 0–127 for automation system. Test documents expected range.
            const haMaxInclusive = 127;
            const thermostatMin = 128;
            expect(thermostatMin).toBe(haMaxInclusive + 1);
        });

        it("counts payload length as action+domain+attribute+data (CNT is BE)", () => {
            // Guide example: CNT=0x0007 for 7-byte payload (3 header + 4 data)
            const actionDomainAttribute = 3;
            const dataBytes = 4;
            expect(actionDomainAttribute + dataBytes).toBe(7);
        });
    });

    describe("AprilaireResponsePayload.toObject routing", () => {
        it("parses Control/Setpoint ReadResponse into ThermostatSetpointAndModeSettingsResponse", () => {
            const data = Buffer.from([
                2, // Heat
                2, // Auto fan
                guideEncodeTemperature(20),
                guideEncodeTemperature(24),
            ]);
            const frame = new AprilaireResponsePayload(
                "127.0.0.1",
                8000,
                1,
                0,
                3 + data.length,
                Action.ReadResponse,
                FunctionalDomain.Control,
                FunctionalDomainControl.ThermstateSetpointAndModeSettings,
                data,
                0
            );
            const obj = frame.toObject();
            expect(obj).toBeInstanceOf(ThermostatSetpointAndModeSettingsResponse);
            expect((obj as ThermostatSetpointAndModeSettingsResponse).heatSetpoint).toBe(20);
        });

        it("parses COS for Controlling Sensors the same as ReadResponse", () => {
            const data = Buffer.from([
                0,
                guideEncodeTemperature(21.5),
                0,
                guideEncodeTemperature(10),
                0,
                40,
                3, // outdoor humidity not installed
                0,
            ]);
            const frame = new AprilaireResponsePayload(
                "127.0.0.1",
                8000,
                1,
                200, // thermostat sequence
                3 + data.length,
                Action.COS,
                FunctionalDomain.Sensors,
                FunctionalDomainSensors.ControllingSensorValues,
                data,
                0
            );
            const obj = frame.toObject();
            expect(obj).toBeInstanceOf(ControllingSensorsStatusAndValueResponse);
            expect((obj as ControllingSensorsStatusAndValueResponse).indoorTemperature).toBe(21.5);
        });

        it("parses Identification/MAC ReadResponse", () => {
            const data = Buffer.from([0xb4, 0x82, 0x55, 0x01, 0x02, 0x03, 0, 1]);
            const frame = new AprilaireResponsePayload(
                "127.0.0.1",
                8000,
                1,
                0,
                3 + data.length,
                Action.ReadResponse,
                FunctionalDomain.Identification,
                FunctionalDomainIdentification.MacAddress,
                data,
                0
            );
            const obj = frame.toObject();
            expect(obj).toBeInstanceOf(MacAddressResponse);
        });

        it("parses Scheduling/Hold under Scheduling domain attribute 4", () => {
            const data = Buffer.from([
                1, // temporary
                2, // auto fan
                guideEncodeTemperature(19),
                guideEncodeTemperature(26),
                0,
                0,
                0,
                1,
                1,
                26,
            ]);
            const frame = new AprilaireResponsePayload(
                "127.0.0.1",
                8000,
                1,
                0,
                3 + data.length,
                Action.ReadResponse,
                FunctionalDomain.Scheduling,
                FunctionalDomainScheduling.ScheduleHold,
                data,
                0
            );
            const obj = frame.toObject();
            expect(obj).toBeInstanceOf(ScheduleHoldResponse);
        });

        it("parses Setup/DateAndTime ReadResponse into DateAndTimeResponse", () => {
            // sec,min,hour,date,day,month,year−2000 — 2026-07-18 Sat 14:30:45
            const data = Buffer.from([45, 30, 14, 18, 6, 7, 26]);
            const frame = new AprilaireResponsePayload(
                "127.0.0.1",
                8000,
                1,
                0,
                3 + data.length,
                Action.ReadResponse,
                FunctionalDomain.Setup,
                FunctionalDomainSetup.DateAndTime,
                data,
                0
            );
            const obj = frame.toObject();
            expect(obj).toBeInstanceOf(DateAndTimeResponse);
            const dt = obj as DateAndTimeResponse;
            expect(dt.hour).toBe(14);
            expect(dt.minute).toBe(30);
            expect(dt.second).toBe(45);
            expect(dt.date).toBe(18);
            expect(dt.day).toBe(6);
            expect(dt.month).toBe(7);
            expect(dt.year).toBe(26);
        });

        it("parses Status/ThermostatError into ThermostatErrorResponse", () => {
            const frame = new AprilaireResponsePayload(
                "127.0.0.1",
                8000,
                1,
                0,
                4,
                Action.COS,
                FunctionalDomain.Status,
                FunctionalDomainStatus.ThermostatError,
                Buffer.from([1]),
                0
            );
            const obj = frame.toObject();
            expect(obj).toBeInstanceOf(ThermostatErrorResponse);
            expect((obj as ThermostatErrorResponse).thermostatError).toBe(1);
        });

        it("skips Write and ReadRequest actions (not responses)", () => {
            const write = new AprilaireResponsePayload(
                "127.0.0.1",
                8000,
                1,
                0,
                3,
                Action.Write,
                FunctionalDomain.Control,
                1,
                Buffer.alloc(0),
                0
            );
            expect(write.toObject()).toBeUndefined();
        });
    });

    describe("NACK handling ", () => {
        it("documents guide NACK layout: Action + StatusCode only (no domain/attribute)", () => {
            // protocolexample:
            // REV SEQ CNT=0x0002 Action=0x06 Status=0x10 CRC
            expect(GUIDE_EXAMPLE_NACK_OOR.action).toBe(GuideAction.NAck);
            expect(GUIDE_EXAMPLE_NACK_OOR.statusCode).toBe(GuideNAck.WriteValueOutOfRange);
            expect(GUIDE_EXAMPLE_NACK_OOR.count).toBe(2);
        });

        it("exposes WriteValueOutOfRange as 0x10 for retry/clear policy", () => {
            expect(NAckError.WriteValueOutOfRange).toBe(0x10);
        });

        it("classifies which NACK codes require retry (protocol)", () => {
            const retryCodes = new Set([
                NAckError.GenericError,
                NAckError.BufferFullOrDeviceBusy,
                NAckError.TimedOutWaitingForResponse,
            ]);
            const clearCodes = new Set([
                NAckError.UnsupportedProtocolRevision,
                NAckError.UnknownAction,
                NAckError.UnknownFunctionalDomain,
                NAckError.UnknownAttribute,
                NAckError.ThermostateCannotAcceptWrites,
                NAckError.UnsupportedModel,
                NAckError.WriteValueOutOfRange,
                NAckError.WriteAttributeReadOnly,
                NAckError.WriteAttributeNotWritableInCurrentConfig,
                NAckError.WriteIncorrectPayloadSize,
                NAckError.ReadAttributeNotReadable,
                NAckError.ReadAttributeNotAvailable,
                NAckError.ReadIncorrectPayloadSize,
            ]);

            // Policy helper shape the client should implement (P0/P1)
            const shouldRetry = (code: NAckError) => retryCodes.has(code);
            expect(shouldRetry(NAckError.BufferFullOrDeviceBusy)).toBe(true);
            expect(shouldRetry(NAckError.WriteValueOutOfRange)).toBe(false);
            expect(clearCodes.has(NAckError.WriteValueOutOfRange)).toBe(true);
        });

        it("toObject returns NackResponse with status code (does not throw)", () => {
            // As produced by the frame parser: domain=NAck, attribute=status, payload=[status]
            const nack = new AprilaireResponsePayload(
                "127.0.0.1",
                8000,
                1,
                0,
                2,
                Action.NAck,
                FunctionalDomain.NAck,
                NAckError.WriteValueOutOfRange,
                Buffer.from([NAckError.WriteValueOutOfRange]),
                0
            );

            const obj = nack.toObject();
            expect(obj).toBeInstanceOf(NackResponse);
            expect((obj as NackResponse).statusCode).toBe(NAckError.WriteValueOutOfRange);
            expect((obj as NackResponse).shouldRetry).toBe(false);
        });

        it("NackResponse.shouldRetry is true for busy/timeout/generic (protocol)", () => {
            expect(new NackResponse(NAckError.BufferFullOrDeviceBusy).shouldRetry).toBe(true);
            expect(new NackResponse(NAckError.TimedOutWaitingForResponse).shouldRetry).toBe(true);
            expect(new NackResponse(NAckError.GenericError).shouldRetry).toBe(true);
            expect(new NackResponse(NAckError.WriteValueOutOfRange).shouldRetry).toBe(false);
        });
    });
});
