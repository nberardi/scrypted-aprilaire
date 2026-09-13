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
* Increment Setpoint                        |   0x02    |   No  |   W   |   
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
 * Mid Auto index when we must turn Auto humidification on without a known 1–7
 * level. Must not be {@link HUMIDIFICATION_AUTO_SETPOINT_MAX}: clamping HomeKit
 * %RH into 1–7 previously wrote 7 (max) for a 35% request.
 */
export const HUMIDIFICATION_AUTO_SETPOINT_FALLBACK = 4;

export type HumidificationSetpointWindow = "off" | "auto" | "manual" | "reserved";

export function isHumidificationAutoLevel(value: number | undefined | null): value is number {
    return typeof value === "number" && Number.isInteger(value)
        && value >= HUMIDIFICATION_AUTO_SETPOINT_MIN
        && value <= HUMIDIFICATION_AUTO_SETPOINT_MAX;
}

export function isHumidificationPercentRh(value: number | undefined | null): value is number {
    return typeof value === "number" && Number.isFinite(value)
        && value >= HUMIDIFICATION_SETPOINT_MIN
        && value <= HUMIDIFICATION_SETPOINT_MAX;
}

/**
 * §2.4 wire byte. Auto (1–7) is an index, not %RH — never clamp 10–50 into 1–7.
 */
export function encodeHumidificationSetpointByte(options: {
    on: boolean;
    auto: boolean;
    autoLevel?: number;
    percentRh?: number;
}): number {
    if (!options.on)
        return 0;

    if (options.auto) {
        if (isHumidificationAutoLevel(options.autoLevel))
            return options.autoLevel;
        // Request objects historically stuffed the auto index into humidificationSetpoint.
        if (isHumidificationAutoLevel(options.percentRh))
            return options.percentRh;
        return HUMIDIFICATION_AUTO_SETPOINT_FALLBACK;
    }

    return resolveHumiditySetpointByte(
        true,
        options.percentRh,
        HUMIDIFICATION_SETPOINT_MIN,
        HUMIDIFICATION_SETPOINT_MAX,
        HUMIDIFICATION_SETPOINT_FALLBACK
    );
}

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
    /** Manual %RH (10–50). Ignored on Auto writes unless it is actually a 1–7 index. */
    humidificationSetpoint: number;
    /** Auto window index 1–7. Required to turn Auto humidification on correctly. */
    autoLevel?: number;
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
        const payload = Buffer.alloc(1);
        payload.writeUint8(encodeHumidificationSetpointByte({
            on: this.on,
            auto: this.auto,
            autoLevel: this.autoLevel,
            percentRh: this.humidificationSetpoint,
        }), 0);
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
    on: boolean = false;
    /** §2.4 window. Auto 1–7 is not %RH. */
    window: HumidificationSetpointWindow = "off";
    /** Manual %RH 10–50 only; undefined in Auto / Off. */
    humidificationSetpoint?: number;
    /** Auto index 1–7 only; undefined in Manual / Off. */
    autoLevel?: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Control, FunctionalDomainControl.HumidificationSetpoint);

        if (!this.hasRequiredLength(1))
            return;

        const value = payload.readUint8(0);
        if (value === 0) {
            this.window = "off";
            this.on = false;
        } else if (isHumidificationAutoLevel(value)) {
            this.window = "auto";
            this.on = true;
            this.autoLevel = value;
        } else if (isHumidificationPercentRh(value)) {
            this.window = "manual";
            this.on = true;
            this.humidificationSetpoint = value;
        } else {
            this.window = "reserved";
            this.on = false;
        }
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

/** Scrypted ThermostatMode string values — kept here so protocol tests need no SDK. */
export const ScryptedThermostatMode = {
    Off: "Off",
    Cool: "Cool",
    Heat: "Heat",
    HeatCool: "HeatCool",
    Auto: "Auto",
    FanOnly: "FanOnly",
    On: "On",
} as const;

export type ScryptedThermostatModeName =
    (typeof ScryptedThermostatMode)[keyof typeof ScryptedThermostatMode];

export function supportsAutoChangeover(capabilities?: ThermostatCapabilities): boolean {
    return capabilities === ThermostatCapabilities.HeatCoolAndAuto
        || capabilities === ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto;
}

export function supportsEmergencyHeat(capabilities?: ThermostatCapabilities): boolean {
    return capabilities === ThermostatCapabilities.HeatEmergencyHeatAndCool
        || capabilities === ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto;
}

/**
 * UI modes for §2.7. HeatCool and Auto are omitted unless the thermostat
 * actually lists Auto changeover — both write protocol mode Auto (5).
 * Emergency Heat is a protocol mode Scrypted does not have; expose it as a setting.
 */
export function availableScryptedModesForCapabilities(
    capabilities: ThermostatCapabilities
): ScryptedThermostatModeName[] {
    switch (capabilities) {
        case ThermostatCapabilities.Cool:
            return [ScryptedThermostatMode.FanOnly, ScryptedThermostatMode.Cool];
        case ThermostatCapabilities.Heat:
            return [ScryptedThermostatMode.FanOnly, ScryptedThermostatMode.Heat];
        case ThermostatCapabilities.HeatAndCool:
        case ThermostatCapabilities.HeatEmergencyHeatAndCool:
            return [
                ScryptedThermostatMode.FanOnly,
                ScryptedThermostatMode.Heat,
                ScryptedThermostatMode.Cool,
            ];
        case ThermostatCapabilities.HeatCoolAndAuto:
        case ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto:
            return [
                ScryptedThermostatMode.FanOnly,
                ScryptedThermostatMode.Heat,
                ScryptedThermostatMode.Cool,
                ScryptedThermostatMode.HeatCool,
                ScryptedThermostatMode.Auto,
            ];
        default:
            return [ScryptedThermostatMode.FanOnly];
    }
}

/**
 * Map a Scrypted mode to the protocol Setpoint & Mode byte.
 * HeatCool/Auto/On → Auto (5) only when §2.7 includes Auto; otherwise Null
 * so we do not NACK or enable auto changeover on Heat+Cool-only equipment.
 */
export function protocolModeFromScrypted(
    mode: ScryptedThermostatModeName | string,
    capabilities?: ThermostatCapabilities
): ThermostatMode {
    switch (mode) {
        case ScryptedThermostatMode.Cool:
            return ThermostatMode.Cool;
        case ScryptedThermostatMode.Heat:
            return ThermostatMode.Heat;
        case ScryptedThermostatMode.Off:
        case ScryptedThermostatMode.FanOnly:
            return ThermostatMode.Off;
        case ScryptedThermostatMode.On:
            if (supportsAutoChangeover(capabilities))
                return ThermostatMode.Auto;
            if (capabilities === ThermostatCapabilities.Cool)
                return ThermostatMode.Cool;
            return ThermostatMode.Heat;
        case ScryptedThermostatMode.Auto:
        case ScryptedThermostatMode.HeatCool:
            return supportsAutoChangeover(capabilities)
                ? ThermostatMode.Auto
                : ThermostatMode.Null;
        default:
            return ThermostatMode.Null;
    }
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