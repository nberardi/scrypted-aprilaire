import { FunctionalDomain, FunctionalDomainAlerts } from "./AprilaireClient";
import { BasePayloadRequest } from "./BasePayloadRequest";
import { BasePayloadResponse, readPayloadU8 } from "./BasePayloadResponse";

/*
*
* Functional Domain: Alerts
* Byte: 0x04
*
* Attribute                                 |   Byte    |   COS |   R/W |   Implimented
* ------------------------------------------|-----------|-------|-------|---------------
* Service Reminders Status                  |   0x01    |   Yes |   R/W |   X
* Alerts Status                             |   0x02    |   Yes |   R   |   X
* Alerts Settings                           |   0x03    |   Yes |   R/W |   X
*
*/

/** Write semantics for reminder flag bytes (§4.1). */
export enum ServiceReminderWrite {
    /** Clear this reminder if active. */
    Clear = 0,
    /** Leave this reminder unchanged (does not force-active). */
    Set = 1
}

/**
 * Write Service Reminders Status — 10 bytes.
 * Bytes 0–4: 0 = Clear, 1 = Set (no-op for fields you do not want cleared).
 * Bytes 5–9: percent remaining (read-back values; send 0 if unused).
 */
export class ServiceRemindersStatusRequest extends BasePayloadRequest {
    hvac: ServiceReminderWrite = ServiceReminderWrite.Set;
    airFilter: ServiceReminderWrite = ServiceReminderWrite.Set;
    waterPanel: ServiceReminderWrite = ServiceReminderWrite.Set;
    dehumidifier: ServiceReminderWrite = ServiceReminderWrite.Set;
    freshAir: ServiceReminderWrite = ServiceReminderWrite.Set;
    hvacPercent: number = 0;
    airFilterPercent: number = 0;
    waterPanelPercent: number = 0;
    dehumidifierPercent: number = 0;
    freshAirPercent: number = 0;

    constructor() {
        super(FunctionalDomain.Alerts, FunctionalDomainAlerts.ServiceRemindersStatus);
    }

    /** Convenience: clear only the named reminders; leave others Set. */
    static clear(flags: {
        hvac?: boolean;
        airFilter?: boolean;
        waterPanel?: boolean;
        dehumidifier?: boolean;
        freshAir?: boolean;
    } = {}): ServiceRemindersStatusRequest {
        const req = new ServiceRemindersStatusRequest();
        if (flags.hvac) req.hvac = ServiceReminderWrite.Clear;
        if (flags.airFilter) req.airFilter = ServiceReminderWrite.Clear;
        if (flags.waterPanel) req.waterPanel = ServiceReminderWrite.Clear;
        if (flags.dehumidifier) req.dehumidifier = ServiceReminderWrite.Clear;
        if (flags.freshAir) req.freshAir = ServiceReminderWrite.Clear;
        return req;
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(10);
        payload.writeUint8(this.hvac, 0);
        payload.writeUint8(this.airFilter, 1);
        payload.writeUint8(this.waterPanel, 2);
        payload.writeUint8(this.dehumidifier, 3);
        payload.writeUint8(this.freshAir, 4);
        payload.writeUint8(this.hvacPercent, 5);
        payload.writeUint8(this.airFilterPercent, 6);
        payload.writeUint8(this.waterPanelPercent, 7);
        payload.writeUint8(this.dehumidifierPercent, 8);
        payload.writeUint8(this.freshAirPercent, 9);
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

        this.hvac = Boolean(readPayloadU8(payload, 0));
        this.airFilter = Boolean(readPayloadU8(payload, 1));
        this.waterPanel = Boolean(readPayloadU8(payload, 2));
        this.dehumidifier = Boolean(readPayloadU8(payload, 3));
        this.freshAir = Boolean(readPayloadU8(payload, 4));

        this.hvacPercent = readPayloadU8(payload, 5);
        this.airFilterPercent = readPayloadU8(payload, 6);
        this.waterPanelPercent = readPayloadU8(payload, 7);
        this.dehumidifierPercent = readPayloadU8(payload, 8);
        this.freshAirPercent = readPayloadU8(payload, 9);
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

        this.indoorTemperature = readPayloadU8(payload, 0);
        this.indoorHumidity = readPayloadU8(payload, 1);
        this.serviceReminders = readPayloadU8(payload, 4);
        this.heatPumpFault = readPayloadU8(payload, 5);
        this.builtInSensorFault = readPayloadU8(payload, 6);
        this.remoteSensorFault = readPayloadU8(payload, 7);
        this.humiditySensorFault = readPayloadU8(payload, 8);
        this.operatingSystemFault = readPayloadU8(payload, 9);
        this.threeWireCommunicationFault = readPayloadU8(payload, 10);
        this.wirelessOutdoorSensorFault = readPayloadU8(payload, 11);
        this.updateComplete = readPayloadU8(payload, 12);
    }
}

/** Alerts Settings §4.3 — 21 bytes (bytes 8–20 reserved). */
export const ALERTS_SETTINGS_BYTE_COUNT = 21;

export class AlertsSettingsRequest extends BasePayloadRequest {
    highIndoorTempEnabled: boolean = false;
    /** Index 0–32 → 70–102 °F / 21–37 °C. */
    highIndoorTempIndex: number = 20;
    lowIndoorTempEnabled: boolean = false;
    /** Index 0–42 → 32–74 °F / 0–21 °C. */
    lowIndoorTempIndex: number = 13;
    highIndoorRhEnabled: boolean = false;
    /** 50–90 %RH. */
    highIndoorRhPercent: number = 65;
    lowIndoorRhEnabled: boolean = false;
    /** 10–50 %RH. */
    lowIndoorRhPercent: number = 30;

    constructor() {
        super(FunctionalDomain.Alerts, FunctionalDomainAlerts.AlertsSettings);
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(ALERTS_SETTINGS_BYTE_COUNT);
        payload.writeUint8(this.highIndoorTempEnabled ? 1 : 0, 0);
        payload.writeUint8(this.highIndoorTempIndex, 1);
        payload.writeUint8(this.lowIndoorTempEnabled ? 1 : 0, 2);
        payload.writeUint8(this.lowIndoorTempIndex, 3);
        payload.writeUint8(this.highIndoorRhEnabled ? 1 : 0, 4);
        payload.writeUint8(this.highIndoorRhPercent, 5);
        payload.writeUint8(this.lowIndoorRhEnabled ? 1 : 0, 6);
        payload.writeUint8(this.lowIndoorRhPercent, 7);
        return payload;
    }
}

export class AlertsSettingsResponse extends BasePayloadResponse {
    highIndoorTempEnabled: boolean;
    highIndoorTempIndex: number;
    lowIndoorTempEnabled: boolean;
    lowIndoorTempIndex: number;
    highIndoorRhEnabled: boolean;
    highIndoorRhPercent: number;
    lowIndoorRhEnabled: boolean;
    lowIndoorRhPercent: number;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Alerts, FunctionalDomainAlerts.AlertsSettings);

        this.highIndoorTempEnabled = readPayloadU8(payload, 0) === 1;
        this.highIndoorTempIndex = readPayloadU8(payload, 1);
        this.lowIndoorTempEnabled = readPayloadU8(payload, 2) === 1;
        this.lowIndoorTempIndex = readPayloadU8(payload, 3);
        this.highIndoorRhEnabled = readPayloadU8(payload, 4) === 1;
        this.highIndoorRhPercent = readPayloadU8(payload, 5);
        this.lowIndoorRhEnabled = readPayloadU8(payload, 6) === 1;
        this.lowIndoorRhPercent = readPayloadU8(payload, 7);
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
