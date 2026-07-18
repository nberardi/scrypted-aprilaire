/**
 * Functional Domain: Alerts (0x04)
 */
import { describe, expect, it } from "vitest";
import {
    AlertStatus,
    AlertsStatusResponse,
    HighLowAlertStatus,
    ServiceRemindersStatusResponse,
    WirelessSensorAlertStatus,
} from "../src/FunctionalDomainAlerts";
import { FunctionalDomain, FunctionalDomainAlerts } from "../src/AprilaireClient";
import { GuideAttribute } from "./helpers/guide-reference";

describe("Alerts domainx", () => {
    describe(" Service Reminders Status", () => {
        it("parses active flags and percent-complete fields", () => {
            // HVAC clear/set + percents per protocol layout
            const payload = Buffer.from([
                1, // HVAC set/active semantics for read
                1, // Air filter
                0, // Water panel
                0, // Dehumidifier
                0, // Fresh air
                80, // HVAC %
                10, // Air filter %
                50, // Water panel %
                0, // Dehumidifier %
                0, // Fresh air %
            ]);
            const res = new ServiceRemindersStatusResponse(payload);
            expect(res.domain).toBe(FunctionalDomain.Alerts);
            expect(res.attribute).toBe(GuideAttribute.Alerts.ServiceRemindersStatus);
            expect(res.attribute).toBe(FunctionalDomainAlerts.ServiceRemindersStatus);
            expect(res.airFilter).toBe(true);
            expect(res.waterPanel).toBe(false);
            expect(res.hvacPercent).toBe(80);
            expect(res.airFilterPercent).toBe(10);
        });
    });

    describe(" Alerts Status", () => {
        it("parses high/low and fault alert bytes with reserved gaps", () => {
            const payload = Buffer.alloc(13);
            payload[0] = HighLowAlertStatus.High; // indoor temp
            payload[1] = HighLowAlertStatus.Low; // indoor RH
            // bytes 2–3 reserved
            payload[4] = AlertStatus.Alert; // service reminders
            payload[5] = AlertStatus.NoAlert; // heat pump
            payload[6] = AlertStatus.Alert; // built-in sensor
            payload[7] = AlertStatus.NoAlert;
            payload[8] = AlertStatus.NoAlert;
            payload[9] = AlertStatus.NoAlert;
            payload[10] = AlertStatus.NoAlert;
            payload[11] = WirelessSensorAlertStatus.LowBattery;
            payload[12] = AlertStatus.NoAlert;

            const res = new AlertsStatusResponse(payload);
            expect(res.attribute).toBe(GuideAttribute.Alerts.AlertsStatus);
            expect(res.indoorTemperature).toBe(HighLowAlertStatus.High);
            expect(res.indoorHumidity).toBe(HighLowAlertStatus.Low);
            expect(res.serviceReminders).toBe(AlertStatus.Alert);
            expect(res.builtInSensorFault).toBe(AlertStatus.Alert);
            expect(res.wirelessOutdoorSensorFault).toBe(WirelessSensorAlertStatus.LowBattery);
        });

        it("maps high/low and wireless sensor enums", () => {
            expect(HighLowAlertStatus.NoAlert).toBe(0);
            expect(HighLowAlertStatus.High).toBe(1);
            expect(HighLowAlertStatus.Low).toBe(2);
            expect(WirelessSensorAlertStatus.EcmModuleError).toBe(1);
            expect(WirelessSensorAlertStatus.WirelessSensorError).toBe(2);
            expect(WirelessSensorAlertStatus.LowBattery).toBe(3);
        });
    });
});
