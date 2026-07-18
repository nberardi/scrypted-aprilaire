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

/**
 * Read Sensors/Sensor Values (§5.1) — empty payload; device replies with 16 status/value bytes.
 * Guide: attribute is COS=No — use explicit ReadRequest, not COS subscription.
 */
export class SensorValuesRequest extends BasePayloadRequest {
    constructor() {
        super(FunctionalDomain.Sensors, FunctionalDomainSensors.SensorValues);
    }
}

/**
 * Sensors §5.1 full sensor array (16 data bytes): pairs of status + value.
 *
 * | Offset | Field |
 * |--------|--------|
 * | 0–1 | Built-in indoor temperature |
 * | 2–3 | Wired remote indoor temperature |
 * | 4–5 | Wired outdoor temperature |
 * | 6–7 | Built-in indoor humidity |
 * | 8–9 | Return air temperature (RAT) |
 * | 10–11 | Supply/leaving air temperature (LAT) |
 * | 12–13 | Wireless outdoor temperature |
 * | 14–15 | Wireless outdoor humidity |
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

        // Guide: 16 status/value bytes. Pad short payloads so partial replies still parse
        // (remaining sensors default to NotInstalled / 0) rather than throwing.
        const data = payload.length >= 16
            ? payload
            : Buffer.concat([payload, Buffer.alloc(16 - payload.length, TemperatureSensorStatus.NotInstalled)]);

        this.indoorTemperatureStatus = data.readUint8(0);
        this.indoorTemperature = convertByteToTemperature(data.readUint8(1));
        this.indoorWiredRemoteTemperatureStatus = data.readUint8(2);
        this.indoorWiredRemoteTemperature = convertByteToTemperature(data.readUint8(3));
        this.outdoorTemperatureStatus = data.readUint8(4);
        this.outdoorTemperature = convertByteToTemperature(data.readUint8(5));
        this.indoorHumidityStatus = data.readUint8(6);
        this.indoorHumidity = data.readUint8(7);
        this.returningAirTemperatureStatus = data.readUint8(8);
        this.returningAirTemperature = convertByteToTemperature(data.readUint8(9));
        this.leavingAirTemperatureStatus = data.readUint8(10);
        this.leavingAirTemperature = convertByteToTemperature(data.readUint8(11));
        this.outdoorWirelessTemperatureStatus = data.readUint8(12);
        this.outdoorWirelessTemperature = convertByteToTemperature(data.readUint8(13));
        this.outdoorHumidityStatus = data.readUint8(14);
        this.outdoorHumidity = data.readUint8(15);
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