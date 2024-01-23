import { FunctionalDomain, convertByteToTemperature, convertTemperatureToByte, FunctionalDomainSensors } from "./AprilaireClient";
import { BasePayloadResponse, ResponseErrorType } from "./BasePayloadResponse";
import { BasePayloadRequest } from "./BasePayloadRequest";

/*
*
* Functional Domain: Sensors Values
* Byte: 0x05
*
* Attribute                                 |   Byte    |   COS |   R/W |   Implimented
* ------------------------------------------|-----------|-------|-------|---------------
* Sensor Values                             |   0x01    |   No  |   R   |   X
* Controlling Sensor Values                 |   0x02    |   Yes |   R   |   X
* Support Modules                           |   0x03    |   Yes |   R   |   
* Written Outdoor Temperature Value         |   0x04    |   Yes |   R/W |   X
*
*/

export class SensorValuesResponse extends BasePayloadResponse {
    indoorTemperatureStatus: TemperatureSensorStatus;
    indoorTemperature: number;
    indoorWiredRemoteTemperatureStatus: TemperatureSensorStatus;
    indoorWiredRemoteTemperature: number;
    outdoorTemperatureStatus: TemperatureSensorStatus;
    outdoorTemperature: number;
    indoorHumidityStatus: HumiditySensorStatus;
    indoorHumidity: number;
    returningAirTemperatureStatus: TemperatureSensorStatus;
    returningAirTemperature: number;
    leavingAirTemperatureStatus: TemperatureSensorStatus;
    leavingAirTemperature: number;
    outdoorWirelessTemperatureStatus: TemperatureSensorStatus;
    outdoorWirelessTemperature: number;
    outdoorHumidityStatus: HumiditySensorStatus; // from wireless
    outdoorHumidity: number; // from wireless
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Sensors, FunctionalDomainSensors.SensorValues);

        this.indoorTemperatureStatus = payload.readUint8(0);
        this.indoorTemperature = convertByteToTemperature(payload.readUint8(1));
        this.indoorWiredRemoteTemperatureStatus = payload.readUint8(2);
        this.indoorWiredRemoteTemperature = convertByteToTemperature(payload.readUint8(3));
        this.outdoorTemperatureStatus = payload.readUint8(4);
        this.outdoorTemperature = convertByteToTemperature(payload.readUint8(5));
        this.indoorHumidityStatus = payload.readUint8(6);
        this.indoorHumidity = payload.readUint8(7);
        this.returningAirTemperatureStatus = payload.readUint8(8);
        this.returningAirTemperature = convertByteToTemperature(payload.readUint8(9));
        this.leavingAirTemperatureStatus = payload.readUint8(10);
        this.leavingAirTemperature = convertByteToTemperature(payload.readUint8(11));
        this.outdoorWirelessTemperatureStatus = payload.readUint8(12);
        this.outdoorWirelessTemperature = convertByteToTemperature(payload.readUint8(13));
        this.outdoorHumidityStatus = payload.readUint8(14);
        this.outdoorHumidity = payload.readUint8(15);
    }
}

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

export class ControllingSensorsStatusAndValueRequest extends BasePayloadRequest {
    constructor() {
        super(FunctionalDomain.Sensors, FunctionalDomainSensors.ControllingSensorValues);
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