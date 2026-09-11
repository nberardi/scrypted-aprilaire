import { FunctionalDomain, FunctionalDomainAlerts } from "./AprilaireClient";
import { BasePayloadRequest } from "./BasePayloadRequest";
import { BasePayloadResponse } from "./BasePayloadResponse";

/*
*
* Functional Domain: Alerts
* Byte: 0x04
*
* Attribute                                 |   Byte    |   COS |   R/W |   Implimented
* ------------------------------------------|-----------|-------|-------|---------------
* Service Reminders Status                  |   0x01    |   Yes |   R/W |   X (read; write clear)
* Alerts Status                             |   0x02    |   Yes |   R   |   X (parse)
* Alerts Settings                           |   0x03    |   Yes |   R/W |   
*
*/

/**
 * Write Service Reminders Status (§4.1).
 * Bytes 0–4: 0 = clear that reminder if active, 1 = leave unchanged.
 * Bytes 5–9: percent fields are read-oriented; written as 0.
 */
export class ServiceRemindersStatusRequest extends BasePayloadRequest {
    /** 0 = clear, 1 = leave alone */
    hvac: number = 1;
    airFilter: number = 1;
    waterPanel: number = 1;
    dehumidifier: number = 1;
    freshAir: number = 1;

    constructor() {
        super(FunctionalDomain.Alerts, FunctionalDomainAlerts.ServiceRemindersStatus);
    }

    /** Clear only the named reminder channels (others left alone). */
    static clear(channels: {
        hvac?: boolean;
        airFilter?: boolean;
        waterPanel?: boolean;
        dehumidifier?: boolean;
        freshAir?: boolean;
    }): ServiceRemindersStatusRequest {
        const req = new ServiceRemindersStatusRequest();
        if (channels.hvac) req.hvac = 0;
        if (channels.airFilter) req.airFilter = 0;
        if (channels.waterPanel) req.waterPanel = 0;
        if (channels.dehumidifier) req.dehumidifier = 0;
        if (channels.freshAir) req.freshAir = 0;
        return req;
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(10, 0);
        payload.writeUint8(this.hvac ? 1 : 0, 0);
        payload.writeUint8(this.airFilter ? 1 : 0, 1);
        payload.writeUint8(this.waterPanel ? 1 : 0, 2);
        payload.writeUint8(this.dehumidifier ? 1 : 0, 3);
        payload.writeUint8(this.freshAir ? 1 : 0, 4);
        return payload;
    }
}

export class ServiceRemindersStatusResponse extends BasePayloadResponse {
    hvac: boolean;
    airFilter: boolean;
    waterPanel: boolean;
    dehumidifier: boolean;
    freshAir: boolean;
    hvacPercent: number;
    airFilterPercent: number;
    waterPanelPercent: number;
    dehumidifierPercent: number;
    freshAirPercent: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Alerts, FunctionalDomainAlerts.ServiceRemindersStatus);

        this.hvac = Boolean(payload.readUint8(0));
        this.airFilter = Boolean(payload.readUint8(1));
        this.waterPanel = Boolean(payload.readUint8(2));
        this.dehumidifier = Boolean(payload.readUint8(3));
        this.freshAir = Boolean(payload.readUint8(4));

        this.hvacPercent = payload.readUint8(5);
        this.airFilterPercent = payload.readUint8(6);
        this.waterPanelPercent = payload.readUint8(7);
        this.dehumidifierPercent = payload.readUint8(8);
        this.freshAirPercent = payload.readUint8(9);
    }
}

export class AlertsStatusResponse extends BasePayloadResponse {
    indoorTemperature: HighLowAlertStatus;
    indoorHumidity: HighLowAlertStatus;
    serviceReminders: AlertStatus;
    heatPumpFault: AlertStatus;
    builtInSensorFault: AlertStatus;
    remoteSensorFault: AlertStatus;
    humiditySensorFault: AlertStatus;
    operatingSystemFault: AlertStatus;
    threeWireCommunicationFault: AlertStatus;
    wirelessOutdoorSensorFault: WirelessSensorAlertStatus;
    updateComplete: AlertStatus;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Alerts, FunctionalDomainAlerts.AlertsStatus);

        this.indoorTemperature = payload.readUint8(0);
        this.indoorHumidity = payload.readUint8(1);
        this.serviceReminders = payload.readUint8(4);
        this.heatPumpFault = payload.readUint8(5);
        this.builtInSensorFault = payload.readUint8(6);
        this.remoteSensorFault = payload.readUint8(7);
        this.humiditySensorFault = payload.readUint8(8);
        this.operatingSystemFault = payload.readUint8(9);
        this.threeWireCommunicationFault = payload.readUint8(10);
        this.wirelessOutdoorSensorFault = payload.readUint8(11);
        this.updateComplete = payload.readUint8(12);
    }
}

export enum HighLowAlertStatus {
    NoAlert = 0,
    High = 1,
    Low = 2
}

export enum AlertStatus {
    NoAlert = 0,
    Alert = 1
}

export enum WirelessSensorAlertStatus {
    NoAlert = 0,
    EcmModuleError = 1,
    WirelessSensorError = 2,
    LowBattery = 3
}