import { BasePayloadResponse } from ".";
import { FunctionalDomain, FunctionalDomainControl, convertByteToTemperature } from "../Constants";

export class ThermostatSetpointAndModeSettingsResponse extends BasePayloadResponse {
    mode: ThermostatMode;
    fan: FanStatus;
    heatSetpoint: number;
    coolSetpoint: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.ThermstateSetpointAndModeSettings);

        this.mode = payload.readUint8(0);
        this.fan = payload.readUint8(1);
        this.heatSetpoint = convertByteToTemperature(payload.readUint8(2));
        this.coolSetpoint = convertByteToTemperature(payload.readUint8(3));
    }
}

export enum ThermostatMode {
    Null = 0,
    Off = 1,
    Heat = 2,
    Cool = 3,
    EmergencyHeat = 4,
    Auto = 5
}

export enum FanStatus {
    Null = 0,
    On = 1,
    Auto = 2,
    Circulate = 3
}