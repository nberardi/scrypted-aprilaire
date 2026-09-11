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

        if (!this.hasRequiredLength(10))
            return;

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

        if (!this.hasRequiredLength(13))
            return;

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

        // §4.3 is a fixed 21-byte record whose first 8 bytes are the settings;
        // 8–20 are reserved, so the meaningful prefix is what has to be present.
        if (!this.hasRequiredLength(8))
            return;

        this.highIndoorTempEnabled = payload.readUint8(0) === 1;
        this.highIndoorTempIndex = payload.readUint8(1);
        this.lowIndoorTempEnabled = payload.readUint8(2) === 1;
        this.lowIndoorTempIndex = payload.readUint8(3);
        this.highIndoorRhEnabled = payload.readUint8(4) === 1;
        this.highIndoorRhPercent = payload.readUint8(5);
        this.lowIndoorRhEnabled = payload.readUint8(6) === 1;
        this.lowIndoorRhPercent = payload.readUint8(7);
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
