import { BasePayloadResponse } from ".";
import { FunctionalDomain, FunctionalDomainControl } from "../Constants";

export class ThermostatAndIAQAvailableResponse extends BasePayloadResponse {
    thermostat: ThermostatCapabilities;
    airCleaning: boolean;
    freshAir: boolean;
    dehumidification: boolean;
    humidification: boolean;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.ThermostatAndIAQAvailable);

        this.thermostat = payload.readUint8(0);
        this.airCleaning = Boolean(payload.readUint8(1));
        this.freshAir = Boolean(payload.readUint8(2));
        this.dehumidification = Boolean(payload.readUint8(3));
        this.humidification = Boolean(payload.readUint8(4));
    }
}

export enum ThermostatCapabilities {
    Heat = 1,
    Cool = 2,
    HeatAndCool = 3,
    HeatEmergencyHeatAndCool = 4,
    HeatCoolAndAuto = 5,
    HeatEmergencyHeatCoolAndAuto = 6
}

