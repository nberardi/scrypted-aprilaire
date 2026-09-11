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
* Support Modules                           |   0x03    |   Yes |   R   |   X
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
export const SENSOR_VALUES_BYTE_COUNT = 16;

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

        // Guide: 16 status/value bytes. Pad short payloads so partial replies still
        // parse rather than throwing. Padding must distinguish the two byte roles:
        // status bytes become NotInstalled (so consumers reject them) while value
        // bytes become 0. Filling both with NotInstalled (3) used to decode as a
        // plausible 3.0 °C reading on every missing sensor.
        // Padding keeps this a usable response rather than an error: the padded
        // status bytes truthfully report "no sensor", so consumers reject exactly
        // the sensors that were missing from the reply.
        let data = payload;
        if (payload.length < SENSOR_VALUES_BYTE_COUNT) {
            data = Buffer.alloc(SENSOR_VALUES_BYTE_COUNT);
            payload.copy(data);
            for (let offset = payload.length; offset < SENSOR_VALUES_BYTE_COUNT; offset++) {
                const isStatusByte = offset % 2 === 0;
                data.writeUint8(isStatusByte ? TemperatureSensorStatus.NotInstalled : 0, offset);
            }
        }

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
    /** Undefined leaves the value unchanged (Null on the wire). */
    temperature?: number;
    constructor() {
        super(FunctionalDomain.Sensors, FunctionalDomainSensors.WrittenOutdoorTemperatureValue);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(2);
        payload.writeUint8(0, 0); // sensor status must be 0 for writes
        // 0 °C and Null share byte 0x00 on the wire, so treat only an absent value
        // as unset and let a real 0 °C reading go through the encoder.
        payload.writeUint8(
            this.temperature === undefined || this.temperature === null
                ? 0
                : convertTemperatureToByte(this.temperature),
            1
        );
        return payload;
    }
}

export class WrittenOutdoorTemperatureValueResponse extends BasePayloadResponse {
    status: OurdoorSensorStatus = 0;
    temperature: number = 0;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Sensors, FunctionalDomainSensors.WrittenOutdoorTemperatureValue);

        if (!this.hasRequiredLength(2))
            return;

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
    // Default to NotInstalled so a truncated payload reads as "no sensor" rather
    // than an undefined status that consumers would log as a hardware fault.
    indoorTemperatureStatus: TemperatureSensorStatus = TemperatureSensorStatus.NotInstalled;
    indoorTemperature: number = 0;
    outdoorTemperatureStatus: TemperatureSensorStatus = TemperatureSensorStatus.NotInstalled;
    outdoorTemperature: number = 0;
    indoorHumidityStatus: HumiditySensorStatus = HumiditySensorStatus.NotInstalled;
    indoorHumidity: number = 0;
    outdoorHumidityStatus: HumiditySensorStatus = HumiditySensorStatus.NotInstalled;
    outdoorHumidity: number = 0;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Sensors, FunctionalDomainSensors.ControllingSensorValues);

        if (!this.hasRequiredLength(8))
            return;

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

/**
 * Read Sensors / Support Modules (§5.3) — 1-byte selector 0–3 = module 1–4.
 */
export class SupportModulesRequest extends BasePayloadRequest {
    /** Zero-based module index (0–3). */
    moduleIndex: number = 0;

    constructor(moduleIndex: number = 0) {
        super(FunctionalDomain.Sensors, FunctionalDomainSensors.SupportModules);
        this.moduleIndex = moduleIndex;
    }

    toReadBuffer(): Buffer {
        return Buffer.from([this.moduleIndex & 0x03]);
    }
}

export enum SupportModuleSensorMode {
    Control = 0,
    Monitor = 1,
    Absent = 2
}

/** Support Modules §5.3 — 8 bytes. Except 8810; up to 4 modules. */
export class SupportModulesResponse extends BasePayloadResponse {
    address: number = 0;
    sensor1Status: HumiditySensorStatus = HumiditySensorStatus.NotInstalled;
    sensor1Mode: SupportModuleSensorMode = SupportModuleSensorMode.Absent;
    sensor1Temperature: number = 0;
    sensor2Status: HumiditySensorStatus = HumiditySensorStatus.NotInstalled;
    sensor2Mode: SupportModuleSensorMode = SupportModuleSensorMode.Absent;
    sensor2Temperature: number = 0;
    sensor2Humidity: number = 0;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Sensors, FunctionalDomainSensors.SupportModules);

        if (!this.hasRequiredLength(8))
            return;

        this.address = payload.readUint8(0);
        this.sensor1Status = payload.readUint8(1);
        this.sensor1Mode = payload.readUint8(2);
        this.sensor1Temperature = convertByteToTemperature(payload.readUint8(3));
        this.sensor2Status = payload.readUint8(4);
        this.sensor2Mode = payload.readUint8(5);
        this.sensor2Temperature = convertByteToTemperature(payload.readUint8(6));
        this.sensor2Humidity = payload.readUint8(7);
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