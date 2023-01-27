import { FunctionalDomain, FunctionalDomainSetup } from "../Constants";
import { BasePayloadResponse } from "./BasePayload";

export class ThermostatInstallerSettingsResponse extends BasePayloadResponse {
    scale: TemperatureScale;
    outdoorSensor: OutdoorSensorStatus;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Setup, FunctionalDomainSetup.ThermostatInstallSettings);

        this.scale = payload.readUint8(2);
        this.outdoorSensor = payload.readUint8(15);
    }
}

export enum TemperatureScale {
    F = 0,
    C = 1
}

export enum OutdoorSensorStatus {
    NotInstalled = 0,
    Installed = 1,
    Automation = 2
}