/**
 * Attribute table*
 * Ensures enum constants match documented functional domain / attribute numbers.
 * Priority list: P0 (Thermostat Name = 0x05), P3 (comment/enum drift)
 */
import { describe, expect, it } from "vitest";
import {
    Action,
    FunctionalDomain,
    FunctionalDomainAlerts,
    FunctionalDomainControl,
    FunctionalDomainIdentification,
    FunctionalDomainScheduling,
    FunctionalDomainSensors,
    FunctionalDomainSetup,
    FunctionalDomainStatus,
    NAckError,
} from "../src/AprilaireClient";
import {
    GuideAction,
    GuideAttribute,
    GuideDomain,
    GuideNAck,
} from "./helpers/guide-reference";

describe("protocolattribute / domain / action tables", () => {
    describe("actions ", () => {
        it("matches Write, ReadRequest, ReadResponse, COS, NAck", () => {
            expect(Action.Write).toBe(GuideAction.Write);
            expect(Action.ReadRequest).toBe(GuideAction.ReadRequest);
            expect(Action.ReadResponse).toBe(GuideAction.ReadResponse);
            expect(Action.COS).toBe(GuideAction.COS);
            expect(Action.NAck).toBe(GuideAction.NAck);
        });
    });

    describe("functional domains", () => {
        it("matches domains 1–10 from the attribute table", () => {
            expect(FunctionalDomain.Setup).toBe(GuideDomain.Setup);
            expect(FunctionalDomain.Control).toBe(GuideDomain.Control);
            expect(FunctionalDomain.Scheduling).toBe(GuideDomain.Scheduling);
            expect(FunctionalDomain.Alerts).toBe(GuideDomain.Alerts);
            expect(FunctionalDomain.Sensors).toBe(GuideDomain.Sensors);
            expect(FunctionalDomain.Lockout).toBe(GuideDomain.Lockout);
            expect(FunctionalDomain.Status).toBe(GuideDomain.Status);
            expect(FunctionalDomain.Identification).toBe(GuideDomain.Identification);
            expect(FunctionalDomain.Messaging).toBe(GuideDomain.Messaging);
            expect(FunctionalDomain.Display).toBe(GuideDomain.Display);
        });
    });

    describe("Setup attributes ", () => {
        it("matches installer/scale/time attributes", () => {
            expect(FunctionalDomainSetup.ThermostatInstallSettings).toBe(
                GuideAttribute.Setup.ThermostatInstallerSettings
            );
            expect(FunctionalDomainSetup.ContractorInformation).toBe(
                GuideAttribute.Setup.ContractorInformation
            );
            expect(FunctionalDomainSetup.Scale).toBe(GuideAttribute.Setup.Scale);
            expect(FunctionalDomainSetup.DateAndTime).toBe(GuideAttribute.Setup.DateAndTime);
            expect(FunctionalDomainSetup.AirCleaningInstallerSettings).toBe(
                GuideAttribute.Setup.AirCleaningInstallerSettings
            );
            expect(FunctionalDomainSetup.HumidityControlInstallerSettings).toBe(
                GuideAttribute.Setup.HumidityControlInstallerSettings
            );
            expect(FunctionalDomainSetup.FreshAirInstallerSettings).toBe(
                GuideAttribute.Setup.FreshAirInstallerSettings
            );
            expect(FunctionalDomainSetup.ResetPowerCycle).toBe(
                GuideAttribute.Setup.ResetPowerCycle
            );
        });
    });

    describe("Control attributes ", () => {
        it("matches setpoints, IAQ, and availability", () => {
            expect(FunctionalDomainControl.ThermstateSetpointAndModeSettings).toBe(
                GuideAttribute.Control.ThermostatSetpointAndModeSettings
            );
            expect(FunctionalDomainControl.IncrementSetpoint).toBe(
                GuideAttribute.Control.IncrementSetpoint
            );
            expect(FunctionalDomainControl.DehumidificationSetpoint).toBe(
                GuideAttribute.Control.DehumidificationSetpoint
            );
            expect(FunctionalDomainControl.HumidificationSetpoint).toBe(
                GuideAttribute.Control.HumidificationSetpoint
            );
            expect(FunctionalDomainControl.FreshAirSetting).toBe(
                GuideAttribute.Control.FreshAirSetting
            );
            expect(FunctionalDomainControl.AirCleaningSetting).toBe(
                GuideAttribute.Control.AirCleaningSetting
            );
            expect(FunctionalDomainControl.ThermostatAndIAQAvailable).toBe(
                GuideAttribute.Control.ThermostatAndIAQAvailable
            );
        });
    });

    describe("Scheduling attributes ", () => {
        it("matches schedule/away/hold/heat-blast", () => {
            expect(FunctionalDomainScheduling.ScheduleSettings).toBe(
                GuideAttribute.Scheduling.ScheduleSettings
            );
            expect(FunctionalDomainScheduling.AwaySettings).toBe(
                GuideAttribute.Scheduling.AwaySettings
            );
            expect(FunctionalDomainScheduling.ScheduleDay).toBe(
                GuideAttribute.Scheduling.ScheduleDay
            );
            expect(FunctionalDomainScheduling.ScheduleHold).toBe(
                GuideAttribute.Scheduling.ScheduleHold
            );
            expect(FunctionalDomainScheduling.HeatBlast).toBe(
                GuideAttribute.Scheduling.HeatBlast
            );
        });
    });

    describe("Alerts attributes ", () => {
        it("matches service reminders and alert status/settings", () => {
            expect(FunctionalDomainAlerts.ServiceRemindersStatus).toBe(
                GuideAttribute.Alerts.ServiceRemindersStatus
            );
            expect(FunctionalDomainAlerts.AlertsStatus).toBe(GuideAttribute.Alerts.AlertsStatus);
            expect(FunctionalDomainAlerts.AlertsSettings).toBe(
                GuideAttribute.Alerts.AlertsSettings
            );
        });
    });

    describe("Sensors attributes ", () => {
        it("matches sensor value attributes", () => {
            expect(FunctionalDomainSensors.SensorValues).toBe(GuideAttribute.Sensors.SensorValues);
            expect(FunctionalDomainSensors.ControllingSensorValues).toBe(
                GuideAttribute.Sensors.ControllingSensorValues
            );
            expect(FunctionalDomainSensors.SupportModules).toBe(
                GuideAttribute.Sensors.SupportModules
            );
            expect(FunctionalDomainSensors.WrittenOutdoorTemperatureValue).toBe(
                GuideAttribute.Sensors.WrittenOutdoorTemperatureValue
            );
        });
    });

    describe("Status attributes ", () => {
        it("matches COS, Sync, Offline, statuses, and errors (reserved 3–4 skipped)", () => {
            expect(FunctionalDomainStatus.COS).toBe(GuideAttribute.Status.COS);
            expect(FunctionalDomainStatus.Sync).toBe(GuideAttribute.Status.Sync);
            expect(FunctionalDomainStatus.Offline).toBe(GuideAttribute.Status.Offline);
            expect(FunctionalDomainStatus.ThermostatStatus).toBe(
                GuideAttribute.Status.ThermostatStatus
            );
            expect(FunctionalDomainStatus.IAQStatus).toBe(GuideAttribute.Status.IAQStatus);
            expect(FunctionalDomainStatus.ThermostatError).toBe(
                GuideAttribute.Status.ThermostatError
            );
        });
    });

    describe("Identification attributes ", () => {
        it("matches Revision & Model and MAC Address", () => {
            expect(FunctionalDomainIdentification.RevisionAndModel).toBe(
                GuideAttribute.Identification.RevisionAndModel
            );
            expect(FunctionalDomainIdentification.MacAddress).toBe(
                GuideAttribute.Identification.MacAddress
            );
        });

        it("uses Thermostat Name attribute 0x05", () => {
            // Guide attribute table: Thermostat Name = 0x05
            // Community (S86) reports NACK on attribute 0x04
            expect(FunctionalDomainIdentification.ThermostatName).toBe(
                GuideAttribute.Identification.ThermostatName
            );
            expect(FunctionalDomainIdentification.ThermostatName).toBe(0x05);
        });
    });

    describe("NACK status codes ", () => {
        it("matches documented retry and hard-fail codes", () => {
            expect(NAckError.GenericError).toBe(GuideNAck.GenericError);
            expect(NAckError.BufferFullOrDeviceBusy).toBe(GuideNAck.BufferFullOrDeviceBusy);
            expect(NAckError.UnsupportedProtocolRevision).toBe(
                GuideNAck.UnsupportedProtocolRevision
            );
            expect(NAckError.UnknownAction).toBe(GuideNAck.UnknownAction);
            expect(NAckError.UnknownFunctionalDomain).toBe(GuideNAck.UnknownFunctionalDomain);
            expect(NAckError.UnknownAttribute).toBe(GuideNAck.UnknownAttribute);
            expect(NAckError.ThermostateCannotAcceptWrites).toBe(
                GuideNAck.ThermostatCannotAcceptWrites
            );
            expect(NAckError.TimedOutWaitingForResponse).toBe(
                GuideNAck.TimedOutWaitingForResponse
            );
            expect(NAckError.UnsupportedModel).toBe(GuideNAck.UnsupportedModel);
            expect(NAckError.WriteValueOutOfRange).toBe(GuideNAck.WriteValueOutOfRange);
            expect(NAckError.WriteAttributeReadOnly).toBe(GuideNAck.WriteAttributeReadOnly);
            expect(NAckError.WriteAttributeNotWritableInCurrentConfig).toBe(
                GuideNAck.WriteAttributeNotWritableInCurrentConfig
            );
            expect(NAckError.WriteIncorrectPayloadSize).toBe(GuideNAck.WriteIncorrectPayloadSize);
            expect(NAckError.ReadAttributeNotReadable).toBe(GuideNAck.ReadAttributeNotReadable);
            expect(NAckError.ReadAttributeNotAvailable).toBe(GuideNAck.ReadAttributeNotAvailable);
            expect(NAckError.ReadIncorrectPayloadSize).toBe(GuideNAck.ReadIncorrectPayloadSize);
        });
    });
});
