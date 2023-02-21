import { FunctionalDomain, FunctionalDomainControl, convertByteToTemperature, convertTemperatureToByte } from "./AprilaireClient";
import { BasePayloadResponse } from "./BasePayloadResponse";
import { BasePayloadRequest } from "./BasePayloadRequest";

export class ThermostatSetpointAndModeSettingsResponse extends BasePayloadResponse {
    mode: ThermostatMode;
    fan: FanModeSetting;
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

export class ThermostatSetpointAndModeSettingsRequest extends BasePayloadRequest {
    mode: ThermostatMode = ThermostatMode.Null;
    fan: FanModeSetting = FanModeSetting.Null;
    heatSetpoint: number = 0;
    coolSetpoint: number = 0;
    constructor() {
        super(FunctionalDomain.Control, FunctionalDomainControl.ThermstateSetpointAndModeSettings);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(4);
        payload.writeUint8(this.mode ?? ThermostatMode.Null, 0);
        payload.writeUint8(this.fan ?? FanModeSetting.Null, 1);
        payload.writeUint8(this.heatSetpoint ? convertTemperatureToByte(this.heatSetpoint) : 0, 2);
        payload.writeUint8(this.coolSetpoint ? convertTemperatureToByte(this.coolSetpoint) : 0, 3);
        return payload;
    }
}

export class DehumidificationSetpointRequest extends BasePayloadRequest {
    on: boolean;
    dehumidificationSetpoint: number;
    constructor() {
        super(FunctionalDomain.Control, FunctionalDomainControl.DehumidificationSetpoint);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(1);
        payload.writeUint8(this.on ? this.dehumidificationSetpoint : 0, 0)
        return payload;
    }
}

export class HumidificationSetpointRequest extends BasePayloadRequest {
    on: boolean;
    humidificationSetpoint: number;
    constructor() {
        super(FunctionalDomain.Control, FunctionalDomainControl.HumidificationSetpoint);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(1);
        payload.writeUint8(this.on ? this.humidificationSetpoint : 0, 0)
        return payload;
    }
}

export class DehumidificationSetpointResponse extends BasePayloadResponse {
    on: boolean;
    dehumidificationSetpoint: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.DehumidificationSetpoint);

        this.on = payload.readUint8(0) !== 0;
        this.dehumidificationSetpoint = payload.readUint8(0);
    }
}

export class HumidificationSetpointResponse extends BasePayloadResponse {
    on: boolean;
    humidificationSetpoint: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.HumidificationSetpoint);

        this.on = payload.readUint8(0) !== 0;
        this.humidificationSetpoint = payload.readUint8(0);
    }
}

export class FreshAirSettingsResponse extends BasePayloadResponse {
    mode: FreshAirMode;
    event: FreshAirEvent;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.FreshAirSetting);

        this.mode = payload.readUint8(0);
        this.event = payload.readUint8(1);
    }
}

export class AirCleaningSettingsResponse extends BasePayloadResponse {
    mode: AirCleaningMode;
    event: AirCleaningEvent;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.AirCleaningSetting);

        this.mode = payload.readUint8(0);
        this.event = payload.readUint8(1);
    }
}

export class ThermostatAndIAQAvailableResponse extends BasePayloadResponse {
    thermostat: ThermostatCapabilities;
    airCleaning: boolean;
    freshAirVentilation: boolean;
    dehumidification: boolean;
    humidification: boolean;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.ThermostatAndIAQAvailable);

        this.thermostat = payload.readUint8(0);
        this.airCleaning = Boolean(payload.readUint8(1));
        this.freshAirVentilation = Boolean(payload.readUint8(2));
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


export enum FreshAirMode {
    Off = 0,
    Auto = 1
}

export enum FreshAirEvent {
    Off = 0,
    ThreeHourEvent = 2,
    TwentyFourHourEvent = 3
}

export enum AirCleaningMode {
    Off = 0,
    ConstantClean = 1,
    Auto = 2
}

export enum AirCleaningEvent {
    Off = 0,
    ThreeHourEvent = 3,
    TwentyFourHourEvent = 4
}

export enum ThermostatMode {
    Null = 0,
    Off = 1,
    Heat = 2,
    Cool = 3,
    EmergencyHeat = 4,
    Auto = 5
}

export enum FanModeSetting {
    Null = 0,
    On = 1,
    Auto = 2,
    Circulate = 3
}