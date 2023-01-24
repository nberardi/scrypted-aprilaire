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