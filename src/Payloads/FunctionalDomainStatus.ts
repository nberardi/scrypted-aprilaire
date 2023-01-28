import { BasePayloadResponse } from ".";
import { FunctionalDomain, FunctionalDomainStatus } from "../Constants";

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