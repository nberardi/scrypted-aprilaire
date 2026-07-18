import { FunctionalDomain, FunctionalDomainStatus } from "./AprilaireClient";
import { BasePayloadResponse } from "./BasePayloadResponse";
import { BasePayloadRequest } from "./BasePayloadRequest";

/*
*
* Functional Domain: Status
* Byte: 0x07
*
* Attribute                 |   Byte    |   COS |   R/W |   Implimented
* --------------------------|-----------|-------|-------|---------------
* COS                       |   0x01    |   No  |   R/W |   X
* Sync                      |   0x02    |   No  |   W   |   X
* Off line                  |   0x05    |   Yes |   NA  |   X
* Thermostat Status         |   0x06    |   Yes |   R   |   X
* IAQ Status                |   0x07    |   Yes |   R   |   X
* Thermostat Error          |   0x08    |   Yes |   R   |   X
*
*/

/** Guide §7.1 — COS subscription vector length (bytes 0–28). */
export const COS_SUBSCRIPTION_BYTE_COUNT = 29;

/**
 * Named indices into the Status/COS 29-byte subscription vector (§7.1 / §J.1).
 * Values are 0 = not subscribed, 1 = subscribed.
 */
export enum CosSubscriptionIndex {
    InstallerThermostatSettings = 0,
    ContractorInformation = 1,
    AirCleaningInstallerVariable = 2,
    HumidityControlInstallerSettings = 3,
    FreshAirInstallerSettings = 4,
    ThermostatSetpointAndModeSettings = 5,
    DehumidificationSetpoint = 6,
    HumidificationSetpoint = 7,
    FreshAirSetting = 8,
    AirCleaningSettings = 9,
    ThermostatIAQAvailable = 10,
    ScheduleSettings = 11,
    AwaySettings = 12,
    ScheduleDay = 13,
    ScheduleHold = 14,
    HeatBlast = 15,
    ServiceRemindersStatus = 16,
    AlertsStatus = 17,
    AlertsSettings = 18,
    BacklightSettings = 19,
    ThermostatLocationAndName = 20,
    Reserved = 21,
    ControllingSensorValues = 22,
    OverTheAirOdtUpdateTimeout = 23,
    ThermostatStatus = 24,
    IAQStatus = 25,
    ModelAndRevision = 26,
    SupportModule = 27,
    Lockouts = 28,
}

/** Sparse overrides for {@link CosRequest} (named index → enabled). */
export type CosSubscriptionOverrides = Partial<Record<CosSubscriptionIndex, boolean>>;

/**
 * Default COS subscription vector used by the plugin at connect.
 * Must stay aligned with P1 runtime needs (installer, setpoints, hold, sensors, status).
 */
export function defaultCosSubscriptionFlags(): number[] {
    const flags = new Array<number>(COS_SUBSCRIPTION_BYTE_COUNT).fill(0);
    flags[CosSubscriptionIndex.InstallerThermostatSettings] = 1;
    flags[CosSubscriptionIndex.ThermostatSetpointAndModeSettings] = 1;
    flags[CosSubscriptionIndex.DehumidificationSetpoint] = 1;
    flags[CosSubscriptionIndex.HumidificationSetpoint] = 1;
    flags[CosSubscriptionIndex.FreshAirSetting] = 1;
    flags[CosSubscriptionIndex.AirCleaningSettings] = 1;
    flags[CosSubscriptionIndex.ThermostatIAQAvailable] = 1;
    flags[CosSubscriptionIndex.AwaySettings] = 1;
    flags[CosSubscriptionIndex.ScheduleHold] = 1;
    flags[CosSubscriptionIndex.HeatBlast] = 1;
    flags[CosSubscriptionIndex.ServiceRemindersStatus] = 1;
    flags[CosSubscriptionIndex.AlertsStatus] = 1;
    flags[CosSubscriptionIndex.BacklightSettings] = 1;
    flags[CosSubscriptionIndex.ThermostatLocationAndName] = 1;
    flags[CosSubscriptionIndex.ControllingSensorValues] = 1;
    flags[CosSubscriptionIndex.OverTheAirOdtUpdateTimeout] = 1;
    flags[CosSubscriptionIndex.ThermostatStatus] = 1;
    flags[CosSubscriptionIndex.IAQStatus] = 1;
    flags[CosSubscriptionIndex.ModelAndRevision] = 1;
    return flags;
}

/**
 * Write Status/COS — desired subscription map (§7.1 / §J.1).
 * Optional overrides flip individual bits without changing the rest of the default vector.
 */
export class CosRequest extends BasePayloadRequest {
    /** 29 flags, each 0 or 1 */
    flags: number[];

    constructor(overrides?: CosSubscriptionOverrides) {
        super(FunctionalDomain.Status, FunctionalDomainStatus.COS);
        this.flags = defaultCosSubscriptionFlags();
        if (overrides) {
            for (const [key, enabled] of Object.entries(overrides)) {
                const index = Number(key) as CosSubscriptionIndex;
                if (Number.isInteger(index) && index >= 0 && index < COS_SUBSCRIPTION_BYTE_COUNT && enabled !== undefined) {
                    this.flags[index] = enabled ? 1 : 0;
                }
            }
        }
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(COS_SUBSCRIPTION_BYTE_COUNT);
        for (let i = 0; i < COS_SUBSCRIPTION_BYTE_COUNT; i++) {
            payload.writeUint8(this.flags[i] ? 1 : 0, i);
        }
        return payload;
    }
}

/**
 * Read Status/COS — empty payload; device replies with current 29-byte subscription vector.
 */
export class CosReadRequest extends BasePayloadRequest {
    constructor() {
        super(FunctionalDomain.Status, FunctionalDomainStatus.COS);
    }
}

/**
 * ReadResponse for Status/COS — current subscription vector (§7.1).
 */
export class CosResponse extends BasePayloadResponse {
    /** 29 subscription flags (true = subscribed). */
    subscriptions: boolean[];

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Status, FunctionalDomainStatus.COS);

        this.subscriptions = [];
        for (let i = 0; i < COS_SUBSCRIPTION_BYTE_COUNT; i++) {
            this.subscriptions.push(i < payload.length ? payload.readUint8(i) === 1 : false);
        }
    }

    isEnabled(index: CosSubscriptionIndex | number): boolean {
        if (index < 0 || index >= this.subscriptions.length)
            return false;
        return this.subscriptions[index];
    }

    /** Copy of flags as 0/1 numbers (length 29). */
    toFlags(): number[] {
        return this.subscriptions.map((v) => (v ? 1 : 0));
    }
}

export class SyncResponse extends BasePayloadResponse {
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Status, FunctionalDomainStatus.Sync);
    }
}

export class SyncRequest extends BasePayloadRequest {
    constructor() {
        super(FunctionalDomain.Status, FunctionalDomainStatus.Sync);
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(1);
        payload.writeUInt8(1);
        return payload;
    }
}

export class ThermostatStatusResponse extends BasePayloadResponse {
    heating: HeatingStatus;
    cooling: CoolingStatus;
    progressiveRecovery: ProgressiveRecoveryStatus;
    fan: FanStatus;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Status, FunctionalDomainStatus.ThermostatStatus);

        this.heating = payload.readUint8(0);
        this.cooling = payload.readUint8(1);
        this.progressiveRecovery = payload.readUint8(2);
        this.fan = payload.readUint8(3);
    }
}

export class ThermostatStatusRequest extends BasePayloadRequest {
    constructor() {
        super(FunctionalDomain.Status, FunctionalDomainStatus.ThermostatStatus);
    }
}

export enum HeatingStatus {
    NotActive = 0,
    EquipmentWait,
    Stage1,
    Stage1And2,
    Stage12And3,
    Comp1,
    Comp1And2,
    AuxHeat1,
    AuxHeat2,
    Comp1ElectricHeat1,
    Comp1ElectricHeat2,
    Comp1And2ElectricHeat1,
    Comp1And2ElectricHeat2,
    ElectricHeat1,
    ElectricHeat2
}

export enum CoolingStatus {
    NotActive = 0,
    EquipmentWait,
    Stage1,
    Stage1And2,
    Stage12And3,
    Comp1,
    Comp1And2
}

export enum ProgressiveRecoveryStatus {
    NotActive = 0,
    Active = 1
}

export enum FanStatus {
    NotActive = 0,
    Active = 1
}

export class IAQStatusResponse extends BasePayloadResponse {
    dehumidification: DehumidificationStatus;
    humidification: HumidificationStatus;
    ventilation: VentilationStatus;
    airCleaning: AirCleaningStatus;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Status, FunctionalDomainStatus.IAQStatus);

        this.dehumidification = payload.readUint8(0);
        this.humidification = payload.readUint8(1);
        this.ventilation = payload.readUint8(2);
        this.airCleaning = payload.readUint8(3);
    }
}

export enum DehumidificationStatus {
    NotActive = 0,
    EquipmentWait = 1,
    WholeHomeActive = 2,
    OvercoolingToDehumidify = 3,
    Off = 4
}

export enum HumidificationStatus {
    NotActive = 0,
    EquipmentWait = 1,
    Active = 2,
    Off = 3
}

export enum VentilationStatus {
    NotActive = 0,
    EquipmentWait = 1,
    Active = 2,
    HighTemperatureLockout = 3,
    LowTemperatureLockout = 4,
    HighRHLockout = 5,
    Off = 6
}

export enum AirCleaningStatus {
    NotActive = 0,
    EquipmentWait = 1,
    Active = 2,
    Off = 3
}

export class ThermostatErrorResponse extends BasePayloadResponse {
    thermostatError: ThermostatError;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Status, FunctionalDomainStatus.ThermostatError);

        this.thermostatError = payload.readUint8(0);
    }
}

export enum ThermostatError {
    NoError = 0,
    E1BuiltInTempSensorOpen = 1,
    E2BuiltInTempSensorShort = 2,
    E3NonVolatileMemoryAccessError = 3,
    E5ECMCommunicationLost = 5,
    E6RemoteTempSensorOpen = 6,
    E7RemoteTempSensorShort = 7,
    E8SupportModuleTempLost = 8
}

export class OfflineResponse extends BasePayloadResponse {
    offline: boolean;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Status, FunctionalDomainStatus.Offline);

        this.offline = payload.readUint8(0) === 1;
    }
}