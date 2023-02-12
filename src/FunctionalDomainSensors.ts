import { FunctionalDomain, convertByteToTemperature, convertTemperatureToByte, FunctionalDomainSensors } from "./AprilaireClient";
import { BasePayloadResponse, ResponseErrorType } from "./BasePayloadResponse";
import { BasePayloadRequest } from "./BasePayloadRequest";

export class WrittenOutdoorTemperatureValueRequest extends BasePayloadRequest {
    temperature: number = 0;
    constructor() {
        super(FunctionalDomain.Sensors, FunctionalDomainSensors.WrittenOutdoorTemperatureValue);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(2);
        payload.writeUint8(0, 0); // sensor status must be 0 for writes
        payload.writeUint8(this.temperature ? convertTemperatureToByte(this.temperature) : 0, 1);
        return payload;
    }
}

export class WrittenOutdoorTemperatureValueResponse extends BasePayloadResponse {
    status: OurdoorSensorStatus = 0;
    temperature: number = 0;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Sensors, FunctionalDomainSensors.WrittenOutdoorTemperatureValue);

        if (payload.length === 0) {
            this.responseError = ResponseErrorType.NoPayloadReceived;
            return;
        }

        this.status = payload.readUint8(0);
        this.temperature = convertByteToTemperature(payload.readUint8(1));
    }
}

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

export enum OurdoorSensorStatus {
    NoError = 0,
    TimedOut = 4
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