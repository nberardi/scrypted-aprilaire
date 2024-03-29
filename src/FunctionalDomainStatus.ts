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
* Off line                  |   0x03    |   Yes |   NA  |   
* Thermostat Status         |   0x04    |   Yes |   R   |   X
* IAQ Status                |   0x05    |   Yes |   R   |   X
* Thermostat Error          |   0x06    |   Yes |   R   |   X
*
*/

export class CosRequest extends BasePayloadRequest {
    constructor() {
        super(FunctionalDomain.Status, FunctionalDomainStatus.COS);
    }

    toBuffer(): Buffer {
        const payload = Buffer.from(new Uint8Array([
            1,  // Installer Thermostat Settings
            0,  // Contractor Information
            0,  // Air Cleaning Installer Variable
            0,  // Humidity Control Installer Settings
            0,  // Fresh Air Installer Settings
            1,  // Thermostat Setpoint & Mode Settings
            1,  // Dehumidification Setpoint
            1,  // Humidification Setpoint
            1,  // Fresh Air Setting
            1,  // Air Cleaning Settings
            1,  // Thermostat IAQ Available
            0,  // Schedule Settings
            1,  // Away Settings
            0,  // Schedule Day
            1,  // Schedule Hold
            1,  // Heat Blast
            1,  // Service Reminders Status
            1,  // Alerts Status
            0,  // Alerts Settings
            1,  // Backlight Settings
            1,  // Thermostat Location & Name
            0,  // Reserved
            1,  // Controlling Sensor Values
            1,  // Over the air ODT update timeout
            1,  // Thermostat Status
            1,  // IAQ Status
            1,  // Model & Revision
            0,  // Support Module
            0,  // Lockouts
        ]));
        payload.writeUInt8(1);
        return payload;
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

        this.responseError = payload.readUint8(0);
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