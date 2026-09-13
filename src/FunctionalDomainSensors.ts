import { FunctionalDomain, convertByteToTemperature, convertTemperatureToByte, FunctionalDomainSensors } from "./AprilaireClient";
import { BasePayloadResponse } from "./BasePayloadResponse";
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

        if (!this.hasRequiredLength(SENSOR_VALUES_BYTE_COUNT))
            return;

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

/**
 * §5.4: Automation ODT is invalid if not refreshed in less than 10 minutes.
 * Host writes must be strictly more frequent than that. 9 minutes leaves margin
 * for reconnect/backoff; 0 or invalid values fall back to 1 minute when sync is on.
 */
export const WRITTEN_ODT_TIMEOUT_MINUTES = 10;
export const WRITTEN_ODT_MAX_INTERVAL_MINUTES = 9;
export const WRITTEN_ODT_DEFAULT_INTERVAL_MINUTES = 1;

/**
 * Minutes between Written ODT refreshes, or `undefined` when sync is disabled
 * (no timer). Always in 1..9 when sync is enabled.
 */
export function clampWrittenOdtIntervalMinutes(
    minutes: number,
    syncEnabled: boolean
): number | undefined {
    if (!syncEnabled)
        return undefined;

    if (!Number.isFinite(minutes) || minutes <= 0)
        return WRITTEN_ODT_DEFAULT_INTERVAL_MINUTES;

    return Math.min(
        WRITTEN_ODT_MAX_INTERVAL_MINUTES,
        Math.max(WRITTEN_ODT_DEFAULT_INTERVAL_MINUTES, Math.floor(minutes))
    );
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