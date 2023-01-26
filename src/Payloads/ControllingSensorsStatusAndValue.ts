import { BasePayloadResponse } from ".";
import { FunctionalDomain, FunctionalDomainSensors, convertByteToTemperature } from "../Constants";

export class ControllingSensorsStatusAndValueResponse extends BasePayloadResponse {
    indoorTemperatureStatus: TemperatureSensorStatus;
    indoorTemperature: number;
    outdoorTemperatureStatus: TemperatureSensorStatus;
    outdoorTemperature: number;
    indoorHumidityStatus: HumiditySensorStatus;
    indoorHumidity: number;
    outdoorHumidityStatus: HumiditySensorStatus;
    outdoorHumidity: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Sensors, FunctionalDomainSensors.ControllingSensorValues);

        this.indoorTemperatureStatus = payload.readUint8(0);
        this.indoorTemperature = convertByteToTemperature(payload.readUint8(1));
        this.outdoorTemperatureStatus = payload.readUint8(2);
        this.outdoorTemperature = convertByteToTemperature(payload.readUint8(3));
        this.indoorHumidityStatus = payload.readUint8(4);
        this.indoorHumidity = payload.readUint8(5);
        this.outdoorHumidityStatus = payload.readUint8(6);
        this.outdoorHumidity = payload.readUint8(7);
    }
}

export enum TemperatureSensorStatus {
    NoError = 0,
    OutOfRangeLow = 1,
    OutOfRangeHigh = 2,
    NotInstalled = 3,
    ErrorOpen = 4,
    ErrorShort = 5
}

export enum HumiditySensorStatus {
    NoError = 0,
    NotInstalled = 3,
    Error = 4
}