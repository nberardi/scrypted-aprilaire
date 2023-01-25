enum Action {
    None = 0,
    Write = 1,
    ReadRequest = 2,
    ReadResponse = 3,
    COS = 5,
    NAck = 6
}

enum FunctionalDomain {
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

enum FunctionalDomainIdentification {
    RevisionAndModel = 1,
    MacAddress = 2,
    ThermostatName = 3
}

enum FunctionalDomainControl {
    ThermstateSetpointAndModeSettings = 1,
    IncrementSetpoint = 2,
    DehumidificationSetpoint = 3,
    HumidificationSetponit = 4,
    FreshAirSetting = 5,
    AirCleaningSetting = 6,
    ThermostatAndIAQAvailable = 7
} 

enum FunctionalDomainStatus {
    COS = 1,
    Sync = 2,
    Offline = 3,
    ThermostatStatus = 4,
    IAQStatus = 5,
    ThermostatError = 6
}

enum FunctionalDomainSensors {
    SensorValues = 1,
    ControllingSensorValues = 2,
    SupportModules = 3,
    WrittenOutdoorTempValue = 4
}