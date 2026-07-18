/**
 * Reference values and algorithms for the Aprilaire Wi‑Fi thermostat protocol.
 *
 * These helpers encode documented protocol behavior used as the oracle
 * for unit tests. Production code is compared against this file — not the reverse.
 */

/** protocol— packet frame fields */
export const PROTOCOL_REVISION = 1;

/** protocol— payload actions */
export const GuideAction = {
    Write: 0x01,
    ReadRequest: 0x02,
    ReadResponse: 0x03,
    COS: 0x05,
    NAck: 0x06,
} as const;

/** protocolattribute table — functional domains */
export const GuideDomain = {
    Setup: 0x01,
    Control: 0x02,
    Scheduling: 0x03,
    Alerts: 0x04,
    Sensors: 0x05,
    Lockout: 0x06,
    Status: 0x07,
    Identification: 0x08,
    Messaging: 0x09,
    Display: 0x0a,
} as const;

/** protocol— attribute numbers by domain */
export const GuideAttribute = {
    Setup: {
        ThermostatInstallerSettings: 0x01,
        ContractorInformation: 0x02,
        Scale: 0x03,
        DateAndTime: 0x04,
        AirCleaningInstallerSettings: 0x05,
        HumidityControlInstallerSettings: 0x06,
        FreshAirInstallerSettings: 0x07,
        ResetPowerCycle: 0x08,
    },
    Control: {
        ThermostatSetpointAndModeSettings: 0x01,
        IncrementSetpoint: 0x02,
        DehumidificationSetpoint: 0x03,
        HumidificationSetpoint: 0x04,
        FreshAirSetting: 0x05,
        AirCleaningSetting: 0x06,
        ThermostatAndIAQAvailable: 0x07,
    },
    Scheduling: {
        ScheduleSettings: 0x01,
        AwaySettings: 0x02,
        ScheduleDay: 0x03,
        ScheduleHold: 0x04,
        HeatBlast: 0x05,
    },
    Alerts: {
        ServiceRemindersStatus: 0x01,
        AlertsStatus: 0x02,
        AlertsSettings: 0x03,
    },
    Sensors: {
        SensorValues: 0x01,
        ControllingSensorValues: 0x02,
        SupportModules: 0x03,
        WrittenOutdoorTemperatureValue: 0x04,
    },
    Lockout: {
        LockoutSettings: 0x01,
    },
    Status: {
        COS: 0x01,
        Sync: 0x02,
        // 0x03–0x04 reserved per protocol
        Offline: 0x05,
        ThermostatStatus: 0x06,
        IAQStatus: 0x07,
        ThermostatError: 0x08,
    },
    Identification: {
        RevisionAndModel: 0x01,
        MacAddress: 0x02,
        // Thermostat Name attribute is 0x05
        ThermostatName: 0x05,
    },
    Messaging: {
        PermanentMessages: 0x01,
        TemporaryMessage: 0x02,
    },
    Display: {
        LcdBacklightSettings: 0x01,
    },
} as const;

/** protocol— NACK status codes */
export const GuideNAck = {
    GenericError: 0x01,
    BufferFullOrDeviceBusy: 0x03,
    UnsupportedProtocolRevision: 0x04,
    UnknownAction: 0x05,
    UnknownFunctionalDomain: 0x06,
    UnknownAttribute: 0x07,
    ThermostatCannotAcceptWrites: 0x08,
    TimedOutWaitingForResponse: 0x09,
    UnsupportedModel: 0x0a,
    WriteValueOutOfRange: 0x10,
    WriteAttributeReadOnly: 0x11,
    WriteAttributeNotWritableInCurrentConfig: 0x12,
    WriteIncorrectPayloadSize: 0x13,
    ReadAttributeNotReadable: 0x20,
    ReadAttributeNotAvailable: 0x21,
    ReadIncorrectPayloadSize: 0x22,
} as const;

/**
 * protocoltemperature encoding:
 * bit 7 = sign (0 positive, 1 negative)
 * bit 6 = ½ °C indicator
 * bits 5–0 = integer °C magnitude
 * 0 = Null (do not modify field on write)
 *
 * Examples: * 21.0 °C → 0x15
 * 26.5 °C → 0x5A
 * 21.5 °C → 0x55 (71 °F COS example)
 */
export function guideEncodeTemperature(temperatureCelsius: number): number {
    if (temperatureCelsius === 0 && Object.is(temperatureCelsius, 0)) {
        // 0 °C is a valid temperature; null is represented by callers sending 0 when
        // they mean "do not change". Encoding of true 0 °C is 0x00 per table.
    }

    const isNegative = temperatureCelsius < 0;
    const magnitude = Math.abs(temperatureCelsius);
    const isFraction = magnitude % 1 >= 0.5;
    return Math.floor(magnitude) + (isFraction ? 64 : 0) + (isNegative ? 128 : 0);
}

export function guideDecodeTemperature(byte: number): number {
    if (byte < 0 || byte > 255 || !Number.isInteger(byte)) {
        throw new Error(`${byte} does not fit in a byte`);
    }

    let value = byte & 0x3f; // bits 5–0
    if ((byte >> 6) & 1) {
        value += 0.5;
    }
    if ((byte >> 7) & 1) {
        value = -value;
    }
    return value;
}

/**
 * protocolexample write packet (Setpoint & Mode):
 * REV=0x01 SEQ=0x00 CNT=0x0007
 * Action=Write Domain=Control Attr=Setpoint&Mode
 * Data=Null mode, Fan ON, Heat 21.0C, Cool 26.5C
 * Trailer = CRC over REV+SEQ+CNT+PAYLOAD (table also labels this reserved/0xFF in examples)
 */
export const GUIDE_EXAMPLE_SETPOINT_WRITE_PAYLOAD = Buffer.from([
    0x01, // Write
    0x02, // Control
    0x01, // Setpoint & Mode
    0x00, // Mode Null
    0x01, // Fan On
    0x15, // 21.0 °C heat
    0x5a, // 26.5 °C cool
]);

/** protocolexample — out-of-range heat setpoint 43.5 °C = 0x6B */
export const GUIDE_EXAMPLE_OOR_SETPOINT_PAYLOAD = Buffer.from([
    0x01, 0x02, 0x01, 0x00, 0x00, 0x6b, 0x00,
]);

/** protocolexample for out-of-range: CNT=2, Action=NAck, Status=0x10 */
export const GUIDE_EXAMPLE_NACK_OOR = {
    revision: 0x01,
    sequence: 0x00,
    count: 0x02,
    action: GuideAction.NAck,
    statusCode: GuideNAck.WriteValueOutOfRange,
};

/**
 * protocolway Settings index maps
 */
export const AWAY_HEAT_INDEX_TO_C: Record<number, number> = {
    0: 15.5,
    1: 16,
    2: 16.5,
    3: 17,
    4: 17.5,
    5: 18.5,
};

export const AWAY_COOL_INDEX_TO_C: Record<number, number> = {
    0: 26.5,
    1: 27,
    2: 27.5,
    3: 28.5,
    4: 29,
    5: 29.5,
};

/**
 * protocolsubscription vector length (bytes 0–28).
 */
export const COS_SUBSCRIPTION_BYTE_COUNT = 29;

/**
 * protocolchedule Hold data length (bytes 0–9).
 */
export const SCHEDULE_HOLD_DATA_BYTE_COUNT = 10;

/**
 * protocolritten ODT: must be refreshed in less than 10 minutes.
 */
export const WRITTEN_ODT_MAX_STALE_MS = 10 * 60 * 1000;
