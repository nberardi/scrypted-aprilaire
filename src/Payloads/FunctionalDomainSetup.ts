import { FunctionalDomain, FunctionalDomainSetup } from "../Constants";
import { BasePayloadRequest, BasePayloadResponse } from "./BasePayload";

export class ScaleRequest extends BasePayloadRequest {
    scale: TemperatureScale;
    constructor() {
        super(FunctionalDomain.Setup, FunctionalDomainSetup.Scale);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(1);
        payload.writeUint8(this.scale, 0);
        return payload;
    }
}

export class ScaleResponse extends BasePayloadResponse {
    scale: TemperatureScale;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Setup, FunctionalDomainSetup.Scale);

        this.scale = payload.readUint8(0);
    }
}

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