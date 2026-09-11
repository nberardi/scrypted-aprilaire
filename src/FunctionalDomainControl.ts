import { FunctionalDomain, FunctionalDomainControl, convertByteToTemperature, convertTemperatureToByte } from "./AprilaireClient";
import { BasePayloadResponse } from "./BasePayloadResponse";
import { BasePayloadRequest } from "./BasePayloadRequest";
import { DEFAULT_DEADBAND_C } from "./FunctionalDomainSetup";

/*
*
* Functional Domain: Control
* Byte: 0x02
*
* Attribute                                 |   Byte    |   COS |   R/W |   Implimented
* ------------------------------------------|-----------|-------|-------|---------------
* Thermostate Setpoint and Mode Settings    |   0x01    |   Yes |   R/W |   X
* Increment Setpoint                        |   0x02    |   No  |   W   |   X
* Dehumidiification Setpoint                |   0x03    |   Yes |   R/W |   X
* Humidification Setpoint                   |   0x04    |   Yes |   R/W |   X
* Fresh Air Setting                         |   0x05    |   Yes |   R/W |   X
* Air Cleaning Setting                      |   0x06    |   Yes |   R/W |   X
* Thermostat & IAQ Available                |   0x07    |   Yes |   R   |   X
*
*/

/**
 * Which setpoint to keep when enforcing deadband (Auto mode).
 *
 * Policy (protocol §J.6 / §2.1):
 * - `"heat"` — preserve heat; raise cool to heat + deadband if needed.
 * - `"cool"` — preserve cool; lower heat to cool − deadband if needed.
 * - `"both"` — dual write with no preferred side: preserve heat, raise cool
 *   (matches “non-active / secondary side adjusts” when heat is treated as primary).
 *
 * Guide example (°F → °C at protocol layer): Heat 70°F≈21°C, Cool 73°F≈22.5°C,
 * deadband 3°F≈1.5°C. Lowering cool to 72°F≈22°C with preserve `"cool"` yields heat 20.5°C.
 */
export type DeadbandPreserve = "heat" | "cool" | "both";

export interface DeadbandEnforcementResult {
    heatSetpoint: number;
    coolSetpoint: number;
    /** True when either setpoint was changed to satisfy deadband. */
    adjusted: boolean;
}

/**
 * Ensure cool − heat ≥ deadbandC (protocol Auto-mode minimum separation).
 * Pure helper — unit-testable without Scrypted or TCP.
 *
 * @param heatSetpoint Heat setpoint in °C
 * @param coolSetpoint Cool setpoint in °C
 * @param deadbandC Minimum separation in °C (default 1.5°C / 3°F)
 * @param preserve Which side to keep when adjusting (see {@link DeadbandPreserve})
 */
export function enforceDeadband(
    heatSetpoint: number,
    coolSetpoint: number,
    deadbandC: number = DEFAULT_DEADBAND_C,
    preserve: DeadbandPreserve = "both"
): DeadbandEnforcementResult {
    const separation = coolSetpoint - heatSetpoint;
    if (separation >= deadbandC) {
        return { heatSetpoint, coolSetpoint, adjusted: false };
    }

    if (preserve === "cool") {
        return {
            heatSetpoint: coolSetpoint - deadbandC,
            coolSetpoint,
            adjusted: true,
        };
    }

    // preserve "heat" or "both": keep heat, raise cool
    return {
        heatSetpoint,
        coolSetpoint: heatSetpoint + deadbandC,
        adjusted: true,
    };
}

export class ThermostatSetpointAndModeSettingsResponse extends BasePayloadResponse {
    mode: ThermostatMode;
    fan: FanModeSetting;
    heatSetpoint: number;
    coolSetpoint: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.ThermstateSetpointAndModeSettings);

        if (!this.hasRequiredLength(4))
            return;

        this.mode = payload.readUint8(0);
        this.fan = payload.readUint8(1);
        this.heatSetpoint = convertByteToTemperature(payload.readUint8(2));
        this.coolSetpoint = convertByteToTemperature(payload.readUint8(3));
    }
}

export class ThermostatSetpointAndModeSettingsRequest extends BasePayloadRequest {
    mode: ThermostatMode = ThermostatMode.Null;
    fan: FanModeSetting = FanModeSetting.Null;
    heatSetpoint: number = 0;
    coolSetpoint: number = 0;
    constructor() {
        super(FunctionalDomain.Control, FunctionalDomainControl.ThermstateSetpointAndModeSettings);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(4);
        payload.writeUint8(this.mode ?? ThermostatMode.Null, 0);
        payload.writeUint8(this.fan ?? FanModeSetting.Null, 1);
        payload.writeUint8(this.heatSetpoint ? convertTemperatureToByte(this.heatSetpoint) : 0, 2);
        payload.writeUint8(this.coolSetpoint ? convertTemperatureToByte(this.coolSetpoint) : 0, 3);
        return payload;
    }
}

/** §2.3 writable %RH window; 0 is Off and 1–39 / 91–255 are reserved. */
export const DEHUMIDIFICATION_SETPOINT_MIN = 40;
export const DEHUMIDIFICATION_SETPOINT_MAX = 90;
/** Used only when the thermostat has not yet reported a setpoint to turn on with. */
export const DEHUMIDIFICATION_SETPOINT_FALLBACK = 50;

/** §2.4 manual %RH window; 0 is Off, 1–7 is the Auto window, 8–9 / 51–255 reserved. */
export const HUMIDIFICATION_SETPOINT_MIN = 10;
export const HUMIDIFICATION_SETPOINT_MAX = 50;
export const HUMIDIFICATION_AUTO_SETPOINT_MIN = 1;
export const HUMIDIFICATION_AUTO_SETPOINT_MAX = 7;
/** Used only when the thermostat has not yet reported a setpoint to turn on with. */
export const HUMIDIFICATION_SETPOINT_FALLBACK = 35;

/**
 * Resolve the single wire byte for an IAQ humidity setpoint write.
 *
 * §2.3 / §2.4 carry on/off *in the setpoint value itself* — 0 means Off. So a
 * request with `on = true` but no known setpoint would serialize to 0 and turn
 * the equipment off, which is what happens when a user hits On before the first
 * COS setpoint arrives. Clamp into the writable window instead; a value outside
 * it is NACKed as out of range (0x10) and would be dropped anyway.
 */
function resolveHumiditySetpointByte(
    on: boolean,
    setpoint: number | undefined,
    min: number,
    max: number,
    fallback: number
): number {
    if (!on)
        return 0;

    if (setpoint === undefined || setpoint === null || !Number.isFinite(setpoint) || setpoint <= 0)
        return fallback;

    return Math.min(max, Math.max(min, Math.round(setpoint)));
}

/**
 * Control §2.2 Increment Setpoint — write-only, 4 bytes.
 * Behaves like a thermostat button press (lockouts do not apply).
 * 0 = Decrement, 1 = Increment, 2 = Null (do not change).
 */
export class IncrementSetpointRequest extends BasePayloadRequest {
    heat: IncrementDirection = IncrementDirection.Null;
    cool: IncrementDirection = IncrementDirection.Null;
    humidifier: IncrementDirection = IncrementDirection.Null;
    dehumidifier: IncrementDirection = IncrementDirection.Null;

    constructor() {
        super(FunctionalDomain.Control, FunctionalDomainControl.IncrementSetpoint);
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(4);
        payload.writeUint8(this.heat ?? IncrementDirection.Null, 0);
        payload.writeUint8(this.cool ?? IncrementDirection.Null, 1);
        payload.writeUint8(this.humidifier ?? IncrementDirection.Null, 2);
        payload.writeUint8(this.dehumidifier ?? IncrementDirection.Null, 3);
        return payload;
    }
}

export class DehumidificationSetpointRequest extends BasePayloadRequest {
    on: boolean;
    dehumidificationSetpoint: number;
    constructor() {
        super(FunctionalDomain.Control, FunctionalDomainControl.DehumidificationSetpoint);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(1);
        payload.writeUint8(resolveHumiditySetpointByte(
            this.on,
            this.dehumidificationSetpoint,
            DEHUMIDIFICATION_SETPOINT_MIN,
            DEHUMIDIFICATION_SETPOINT_MAX,
            DEHUMIDIFICATION_SETPOINT_FALLBACK
        ), 0);
        return payload;
    }
}

export class HumidificationSetpointRequest extends BasePayloadRequest {
    on: boolean;
    humidificationSetpoint: number;
    /**
     * True when the thermostat reports humidification in Auto
     * ({@link HumidificationState.Auto}), whose setpoint window is 1–7 rather
     * than the manual 10–50 %RH.
     */
    auto: boolean = false;
    constructor() {
        super(FunctionalDomain.Control, FunctionalDomainControl.HumidificationSetpoint);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(1);
        payload.writeUint8(this.auto
            ? resolveHumiditySetpointByte(
                this.on,
                this.humidificationSetpoint,
                HUMIDIFICATION_AUTO_SETPOINT_MIN,
                HUMIDIFICATION_AUTO_SETPOINT_MAX,
                HUMIDIFICATION_AUTO_SETPOINT_MAX
            )
            : resolveHumiditySetpointByte(
                this.on,
                this.humidificationSetpoint,
                HUMIDIFICATION_SETPOINT_MIN,
                HUMIDIFICATION_SETPOINT_MAX,
                HUMIDIFICATION_SETPOINT_FALLBACK
            ), 0);
        return payload;
    }
}

export class DehumidificationSetpointResponse extends BasePayloadResponse {
    on: boolean;
    dehumidificationSetpoint: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.DehumidificationSetpoint);

        if (!this.hasRequiredLength(1))
            return;

        this.on = payload.readUint8(0) !== 0;
        this.dehumidificationSetpoint = payload.readUint8(0);
    }
}

export class HumidificationSetpointResponse extends BasePayloadResponse {
    on: boolean;
    humidificationSetpoint: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.HumidificationSetpoint);

        if (!this.hasRequiredLength(1))
            return;

        this.on = payload.readUint8(0) !== 0;
        this.humidificationSetpoint = payload.readUint8(0);
    }
}

export class FreshAirSettingsRequest extends BasePayloadRequest {
    mode: FreshAirMode = FreshAirMode.Off;
    event: FreshAirEvent = FreshAirEvent.Off;

    constructor() {
        super(FunctionalDomain.Control, FunctionalDomainControl.FreshAirSetting);
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(2);
        payload.writeUint8(this.mode ?? FreshAirMode.Off, 0);
        payload.writeUint8(this.event ?? FreshAirEvent.Off, 1);
        return payload;
    }
}

export class FreshAirSettingsResponse extends BasePayloadResponse {
    mode: FreshAirMode;
    event: FreshAirEvent;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.FreshAirSetting);

        if (!this.hasRequiredLength(2))
            return;

        this.mode = payload.readUint8(0);
        this.event = payload.readUint8(1);
    }
}

export class AirCleaningSettingsRequest extends BasePayloadRequest {
    mode: AirCleaningMode = AirCleaningMode.Off;
    event: AirCleaningEvent = AirCleaningEvent.Off;

    constructor() {
        super(FunctionalDomain.Control, FunctionalDomainControl.AirCleaningSetting);
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(2);
        payload.writeUint8(this.mode ?? AirCleaningMode.Off, 0);
        payload.writeUint8(this.event ?? AirCleaningEvent.Off, 1);
        return payload;
    }
}

export class AirCleaningSettingsResponse extends BasePayloadResponse {
    mode: AirCleaningMode;
    event: AirCleaningEvent;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.AirCleaningSetting);

        if (!this.hasRequiredLength(2))
            return;

        this.mode = payload.readUint8(0);
        this.event = payload.readUint8(1);
    }
}

/** §2.7 availability bytes: 0 = No, 1 = Yes, 2–255 reserved. */
const IAQ_AVAILABLE_YES = 1;

export class ThermostatAndIAQAvailableResponse extends BasePayloadResponse {
    thermostat: ThermostatCapabilities;
    airCleaning: boolean = false;
    freshAirVentilation: boolean = false;
    dehumidification: boolean = false;
    humidification: HumidificationState = HumidificationState.NotAvailable;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.ThermostatAndIAQAvailable);

        if (!this.hasRequiredLength(5))
            return;

        this.thermostat = payload.readUint8(0);
        // Only the documented value 1 means "installed". Treating every non-zero
        // byte as Yes would publish IAQ devices from reserved values.
        this.airCleaning = payload.readUint8(1) === IAQ_AVAILABLE_YES;
        this.freshAirVentilation = payload.readUint8(2) === IAQ_AVAILABLE_YES;
        this.dehumidification = payload.readUint8(3) === IAQ_AVAILABLE_YES;
        this.humidification = payload.readUint8(4);
    }
}

export enum HumidificationState {
    NotAvailable = 0,
    Auto = 1,
    Manual = 2
}

export enum ThermostatCapabilities {
    Heat = 1,
    Cool = 2,
    HeatAndCool = 3,
    HeatEmergencyHeatAndCool = 4,
    HeatCoolAndAuto = 5,
    HeatEmergencyHeatCoolAndAuto = 6
}


export enum IncrementDirection {
    Decrement = 0,
    Increment = 1,
    Null = 2
}

export enum FreshAirMode {
    Off = 0,
    Auto = 1
}

export enum FreshAirEvent {
    Off = 0,
    ThreeHourEvent = 2,
    TwentyFourHourEvent = 3
}

export enum AirCleaningMode {
    Off = 0,
    ConstantClean = 1,
    Auto = 2
}

export enum AirCleaningEvent {
    Off = 0,
    ThreeHourEvent = 3,
    TwentyFourHourEvent = 4
}

export enum ThermostatMode {
    Null = 0,
    Off = 1,
    Heat = 2,
    Cool = 3,
    EmergencyHeat = 4,
    Auto = 5
}

export enum FanModeSetting {
    Null = 0,
    On = 1,
    Auto = 2,
    Circulate = 3
}