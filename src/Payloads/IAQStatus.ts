import { BasePayloadResponse } from ".";
import { FunctionalDomain, FunctionalDomainStatus } from "../Constants";


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