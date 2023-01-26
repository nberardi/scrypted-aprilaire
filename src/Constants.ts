export enum Action {
    None = 0,
    Write = 1,
    ReadRequest = 2,
    ReadResponse = 3,
    COS = 5,
    NAck = 6
}

export enum FunctionalDomain {
    None = 0,
    Setup = 1,
    Control = 2,
    Scheduling = 3,
    Alerts = 4,
    Sensors = 5,
    Lockout = 6,
    Status = 7,
    Identification = 8,
    Messaging = 9,
    Display = 10,
    Weather = 13,
    FirmwareUpdate = 14,
    DebugCommands = 15,
    NAck = 16
}

export enum FunctionalDomainIdentification {
    RevisionAndModel = 1,
    MacAddress = 2,
    ThermostatName = 4
}

export enum FunctionalDomainControl {
    ThermstateSetpointAndModeSettings = 1,
    IncrementSetpoint = 2,
    DehumidificationSetpoint = 3,
    HumidificationSetponit = 4,
    FreshAirSetting = 5,
    AirCleaningSetting = 6,
    ThermostatAndIAQAvailable = 7
} 

export enum FunctionalDomainStatus {
    COS = 1,
    Sync = 2,
    Offline = 5,
    ThermostatStatus = 6,
    IAQStatus = 7,
    ThermostatError = 8
}

export enum FunctionalDomainSensors {
    SensorValues = 1,
    ControllingSensorValues = 2,
    SupportModules = 3,
    WrittenOutdoorTempValue = 4
}

export enum NAckError {
    GenericError = 0x1,
    BufferFullOrDeviceBusy = 0x3,
    UnsupportedProtocolRevision = 0x4,
    UnknownAction = 0x5,
    UnknownFunctionalDomain = 0x6,
    UnknownAttribute = 0x7,
    ThermostateCannotAcceptWrites = 0x8,
    TimedOutWaitingForResponse = 0x9,
    UnsupportedModel = 0xA,
    WriteValueOutOfRange = 0x10,
    WriteAttributeReadOnly = 0x11,
    WriteAttributeNotWritableInCurrentConfig = 0x12,
    WriteIncorrectPayloadSize = 0x13,
    ReadAttributeNotReadable = 0x20,
    ReadAttributeNotAvailable = 0x21,
    ReadIncorrectPayloadSize = 0x22
}

export function convertByteToTemperature(byte: number): number {
    if (byte < 0 || byte > 255 || byte % 1 !== 0) {
        throw new Error(byte + " does not fit in a byte");
    }
    // LOG bits ("000000000" + byte.toString(2)).substring(-8);
    let value = byte & 63;

    // has fraction
    if (Boolean(byte >> 6 & 1))
        value += 0.5;

    // is negative
    if (byte >> 1 === 1)
        value = -value;

    return value;
}