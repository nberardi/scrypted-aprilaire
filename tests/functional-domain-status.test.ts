/**
 * Functional Domain: Status (0x07)
 *
 * Priority list: P0 ThermostatError field; P1 COS vector / Sync bootstrap
 */
import { describe, expect, it } from "vitest";
import {
    AirCleaningStatus,
    COS_SUBSCRIPTION_BYTE_COUNT as PROD_COS_COUNT,
    CosReadRequest,
    CosRequest,
    CosResponse,
    CosSubscriptionIndex,
    CoolingStatus,
    defaultCosSubscriptionFlags,
    DehumidificationStatus,
    FanStatus,
    HeatingStatus,
    HumidificationStatus,
    IAQStatusResponse,
    OfflineResponse,
    ProgressiveRecoveryStatus,
    SyncRequest,
    SyncResponse,
    ThermostatError,
    ThermostatErrorResponse,
    ThermostatStatusResponse,
    VentilationStatus,
} from "../src/FunctionalDomainStatus";
import {
    FunctionalDomain,
    FunctionalDomainStatus,
} from "../src/AprilaireClient";
import {
    COS_SUBSCRIPTION_BYTE_COUNT,
    GuideAttribute,
    GuideDomain,
} from "./helpers/guide-reference";

describe("Status domainx", () => {
    describe(" COS Subscriptions", () => {
        it("binds to Status / COS attribute 0x01", () => {
            const req = new CosRequest();
            expect(req.domain).toBe(GuideDomain.Status);
            expect(req.attribute).toBe(GuideAttribute.Status.COS);
            expect(req.attribute).toBe(FunctionalDomainStatus.COS);
        });

        it("writes a 29-byte subscription vector (protocolbytes 0–28)", () => {
            const buf = new CosRequest().toBuffer();
            expect(buf.length).toBe(COS_SUBSCRIPTION_BYTE_COUNT);
            expect(buf.length).toBe(PROD_COS_COUNT);
        });

        it("enables core runtime subscriptions used by best practices", () => {
            const buf = new CosRequest().toBuffer();
            // Subscription indices
            expect(buf[0]).toBe(1); // Installer Thermostat Settings (Setup/1 — deadband, Away, Heat Blast)
            expect(buf[5]).toBe(1); // Thermostat Setpoint & Mode
            expect(buf[6]).toBe(1); // Dehumidification Setpoint
            expect(buf[7]).toBe(1); // Humidification Setpoint
            expect(buf[10]).toBe(1); // Thermostat IAQ Available
            expect(buf[12]).toBe(1); // Away Settings
            expect(buf[14]).toBe(1); // Schedule Hold
            expect(buf[15]).toBe(1); // Heat Blast
            expect(buf[16]).toBe(1); // Service Reminders Status
            expect(buf[22]).toBe(1); // Controlling Sensor Values
            expect(buf[24]).toBe(1); // Thermostat Status
            expect(buf[25]).toBe(1); // IAQ Status
        });

        it("subscription values are only 0 or 1", () => {
            const buf = new CosRequest().toBuffer();
            for (let i = 0; i < buf.length; i++) {
                expect([0, 1]).toContain(buf[i]);
            }
        });

        it("defaultCosSubscriptionFlags matches default CosRequest wire vector", () => {
            expect(new CosRequest().toBuffer()).toEqual(
                Buffer.from(defaultCosSubscriptionFlags())
            );
        });

        it("CosRequest overrides flip only the intended indices", () => {
            const baseline = new CosRequest().toBuffer();
            const req = new CosRequest({
                [CosSubscriptionIndex.ScheduleSettings]: true,
                [CosSubscriptionIndex.SupportModule]: true,
                [CosSubscriptionIndex.HeatBlast]: false,
            });
            const buf = req.toBuffer();
            expect(buf.length).toBe(29);
            expect(buf[CosSubscriptionIndex.ScheduleSettings]).toBe(1);
            expect(buf[CosSubscriptionIndex.SupportModule]).toBe(1);
            expect(buf[CosSubscriptionIndex.HeatBlast]).toBe(0);
            // Unrelated indices unchanged
            expect(buf[CosSubscriptionIndex.InstallerThermostatSettings]).toBe(
                baseline[CosSubscriptionIndex.InstallerThermostatSettings]
            );
            expect(buf[CosSubscriptionIndex.ControllingSensorValues]).toBe(
                baseline[CosSubscriptionIndex.ControllingSensorValues]
            );
            expect(buf[CosSubscriptionIndex.ScheduleHold]).toBe(
                baseline[CosSubscriptionIndex.ScheduleHold]
            );
        });

        it("CosReadRequest is empty-body Status/COS read", () => {
            const req = new CosReadRequest();
            expect(req.domain).toBe(FunctionalDomain.Status);
            expect(req.attribute).toBe(FunctionalDomainStatus.COS);
            expect(req.toBuffer()).toEqual(Buffer.alloc(0));
        });

        it("CosResponse parses a 29-byte subscription vector", () => {
            const wire = Buffer.alloc(29, 0);
            wire[0] = 1;
            wire[22] = 1;
            wire[27] = 1;
            const res = new CosResponse(wire);
            expect(res.attribute).toBe(GuideAttribute.Status.COS);
            expect(res.subscriptions).toHaveLength(29);
            expect(res.isEnabled(CosSubscriptionIndex.InstallerThermostatSettings)).toBe(true);
            expect(res.isEnabled(CosSubscriptionIndex.ControllingSensorValues)).toBe(true);
            expect(res.isEnabled(CosSubscriptionIndex.SupportModule)).toBe(true);
            expect(res.isEnabled(CosSubscriptionIndex.Lockouts)).toBe(false);
            expect(res.toFlags()[22]).toBe(1);
            expect(res.toFlags()[28]).toBe(0);
        });

        it("CosResponse pads short payloads with false", () => {
            const res = new CosResponse(Buffer.from([1, 0, 1]));
            expect(res.subscriptions).toHaveLength(29);
            expect(res.subscriptions[0]).toBe(true);
            expect(res.subscriptions[2]).toBe(true);
            expect(res.subscriptions[3]).toBe(false);
            expect(res.subscriptions[28]).toBe(false);
        });
    });

    describe(" Sync", () => {
        it("writes Sync=1 to start full COS dump", () => {
            const req = new SyncRequest();
            expect(req.domain).toBe(FunctionalDomain.Status);
            expect(req.attribute).toBe(GuideAttribute.Status.Sync);
            expect(req.toBuffer()).toEqual(Buffer.from([1]));
        });

        it("parses Sync complete response/COS", () => {
            const res = new SyncResponse(Buffer.from([1]));
            expect(res.attribute).toBe(GuideAttribute.Status.Sync);
        });
    });

    describe(" Offline", () => {
        it("parses 0=Normal, 1=Offline", () => {
            expect(new OfflineResponse(Buffer.from([0])).offline).toBe(false);
            expect(new OfflineResponse(Buffer.from([1])).offline).toBe(true);
            expect(new OfflineResponse(Buffer.from([1])).attribute).toBe(
                GuideAttribute.Status.Offline
            );
        });
    });

    describe(" Thermostat Status", () => {
        it("parses heating, cooling, progressive recovery, fan", () => {
            const payload = Buffer.from([
                HeatingStatus.Stage1, // 2
                CoolingStatus.NotActive, // 0
                ProgressiveRecoveryStatus.NotActive, // 0
                FanStatus.Active, // 1
            ]);
            const res = new ThermostatStatusResponse(payload);
            expect(res.heating).toBe(HeatingStatus.Stage1);
            expect(res.cooling).toBe(CoolingStatus.NotActive);
            expect(res.progressiveRecovery).toBe(ProgressiveRecoveryStatus.NotActive);
            expect(res.fan).toBe(FanStatus.Active);
            expect(res.attribute).toBe(GuideAttribute.Status.ThermostatStatus);
        });

        it("maps heating equipment statuses 0–14 per protocol", () => {
            expect(HeatingStatus.NotActive).toBe(0);
            expect(HeatingStatus.EquipmentWait).toBe(1);
            expect(HeatingStatus.Stage1).toBe(2);
            expect(HeatingStatus.ElectricHeat2).toBe(14);
        });
    });

    describe(" IAQ Status", () => {
        it("parses dehum, hum, ventilation, air cleaning", () => {
            const payload = Buffer.from([
                DehumidificationStatus.WholeHomeActive, // 2
                HumidificationStatus.Active, // 2
                VentilationStatus.HighTemperatureLockout, // 3
                AirCleaningStatus.Off, // 3
            ]);
            const res = new IAQStatusResponse(payload);
            expect(res.dehumidification).toBe(DehumidificationStatus.WholeHomeActive);
            expect(res.humidification).toBe(HumidificationStatus.Active);
            expect(res.ventilation).toBe(VentilationStatus.HighTemperatureLockout);
            expect(res.airCleaning).toBe(AirCleaningStatus.Off);
            expect(res.attribute).toBe(GuideAttribute.Status.IAQStatus);
        });
    });

    describe(" Thermostat Errors ", () => {
        it("binds attribute 0x08", () => {
            const res = new ThermostatErrorResponse(Buffer.from([0]));
            expect(res.attribute).toBe(GuideAttribute.Status.ThermostatError);
            expect(res.domain).toBe(FunctionalDomain.Status);
        });

        it("populates thermostatError from byte 0", () => {
            const cases: Array<[number, ThermostatError]> = [
                [0, ThermostatError.NoError],
                [1, ThermostatError.E1BuiltInTempSensorOpen],
                [2, ThermostatError.E2BuiltInTempSensorShort],
                [3, ThermostatError.E3NonVolatileMemoryAccessError],
                [5, ThermostatError.E5ECMCommunicationLost],
                [6, ThermostatError.E6RemoteTempSensorOpen],
                [7, ThermostatError.E7RemoteTempSensorShort],
                [8, ThermostatError.E8SupportModuleTempLost],
            ];

            for (const [byte, expected] of cases) {
                const res = new ThermostatErrorResponse(Buffer.from([byte]));
                expect(res.thermostatError).toBe(expected);
            }
        });

        it("does not mis-assign the error into responseError payload flag", () => {
            const res = new ThermostatErrorResponse(
                Buffer.from([ThermostatError.E1BuiltInTempSensorOpen])
            );
            // responseError is a parse-health flag (NoError/Malformed/NoPayload),
            // not the thermostat E-code.
            expect(res.thermostatError).toBe(ThermostatError.E1BuiltInTempSensorOpen);
            expect(res.responseError).not.toBe(ThermostatError.E1BuiltInTempSensorOpen);
        });
    });
});
