import { FunctionalDomain, FunctionalDomainSetup } from "./AprilaireClient";
import { BasePayloadResponse } from "./BasePayloadResponse";
import { BasePayloadRequest } from "./BasePayloadRequest";

/*
*
* Functional Domain: Set-up
* Byte: 0x01
*
* Attribute                             |   Byte    |   COS |   R/W |   Implimented
* --------------------------------------|-----------|-------|-------|---------------
* Thermostate Installer Settings        |   0x01    |   Yes |   R   |   X
* Contractor Information                |   0x02    |   Yes |   R/W |   
* Scale                                 |   0x03    |   No  |   R/W |   X
* Date and Time                         |   0x04    |   No  |   R/W |   
* Air Cleaning Installer Settings       |   0x05    |   Yes |   R   |   
* Humidity Control Installer Settings   |   0x06    |   Yes |   R   |   
* Fresh Air Installer Settings          |   0x07    |   Yes |   R   |   
* Reset/Power cycle                     |   0x08    |   No  |   W   |   
*
*/

export class ScaleRequest extends BasePayloadRequest {
    scale: TemperatureScale;
    constructor() {
        super(FunctionalDomain.Setup, FunctionalDomainSetup.Scale);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(1);
        payload.writeUint8(this.scale, 0);
        return payload;
    }
}

export class ScaleResponse extends BasePayloadResponse {
    scale: TemperatureScale;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Setup, FunctionalDomainSetup.Scale);

        this.scale = payload.readUint8(0);
    }
}

/**
 * Explicit read of Setup / Thermostat Installer Settings (attribute 0x01).
 * Empty payload; device replies with a large (~44–56 byte) ReadResponse/COS.
 */
export class ThermostatInstallerSettingsRequest extends BasePayloadRequest {
    constructor() {
        super(FunctionalDomain.Setup, FunctionalDomainSetup.ThermostatInstallSettings);
    }
}

/**
 * Setup §1.1 Thermostat Installer Settings — bootstrap fields used by the plugin.
 *
 * Byte map (0-based indices into the attribute payload; guide field numbers in
 * parentheses). Source: Aprilaire WiFi Thermostat Protocol guide v1.00 §1.1.
 * Also cross-checked against pyaprilaire (AWAY_AVAILABLE at index 26).
 *
 * | Offset | Field                         | Values / notes |
 * |--------|-------------------------------|----------------|
 * | 2      | scale (#2)                    | 0=F, 1=C (existing) |
 * | 12     | autoChangeover (#12)          | 0=Disabled, 1=Enabled |
 * | 13     | deadband (#13)                | 0–7 → 2F/1C … 9F/4.5C; ignore if auto off |
 * | 15     | outdoorSensor (#15)           | 0=NotInstalled, 1=Installed, 2=Automation (existing) |
 * | 26     | awayEnabled (#26)             | 0=Disabled, 1=Enabled (pyaprilaire AWAY_AVAILABLE) |
 * | 27     | heatBlastEnabled (#27)        | 0=Disabled, 1=Enabled |
 * | 28     | heatBlastOffset (#28)         | 0=3F/1.5C, 1=4F/2C, 2=5F/2.5C |
 * | 34     | hvacServiceReminderMonths (#43) | 0=Null, 1–12=months, 13=Off |
 * | 41     | airFilterServiceReminderMonths (#54, 8476) | 1–12=months, 13=Off |
 * | 42     | waterPanelServiceReminderMonths (#55, 8476) | 1–12=months, 13=Off |
 *
 * Payload is typically ~44–56 bytes. Fields beyond `payload.length` are left at
 * safe defaults (disabled / 0). Do not invent offsets not listed above.
 */
export class ThermostatInstallerSettingsResponse extends BasePayloadResponse {
    /** Byte 2 — Temperature Scale (#2). */
    scale: TemperatureScale;
    /** Byte 12 — Auto Changeover (#12); deadband only applies when enabled. */
    autoChangeoverEnabled: boolean;
    /**
     * Byte 13 — Deadband (#13) raw enum:
     * 0=2F/1C, 1=3F/1.5C, 2=4F/2C, 3=5F/2.5C, 4=6F/3C, 5=7F/3.5C, 6=8F/4C, 7=9F/4.5C.
     * Stable name for issue #15 deadband enforcement.
     */
    deadband: number;
    /** Byte 15 — Outdoor Sensor (#15). */
    outdoorSensor: OutdoorSensorStatus;
    /** Byte 26 — Away (#26); 1 = enabled in installer. */
    awayEnabled: boolean;
    /** Byte 27 — Heat Blast (#27); 1 = enabled in installer. */
    heatBlastEnabled: boolean;
    /** Byte 28 — Heat Blast Offset (#28) raw enum. */
    heatBlastOffset: number;
    /**
     * Byte 34 — HVAC Service Reminder (#43) months:
     * 0=Null, 1–12=interval months, 13=Off.
     */
    hvacServiceReminderMonths: number;
    /**
     * Byte 41 — 8476 Change Air Filter Reminder (#54) months:
     * 1–12=interval months, 13=Off (0 reserved).
     */
    airFilterServiceReminderMonths: number;
    /**
     * Byte 42 — 8476 Change Water Panel Reminder (#55) months:
     * 1–12=interval months, 13=Off (0 reserved).
     */
    waterPanelServiceReminderMonths: number;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Setup, FunctionalDomainSetup.ThermostatInstallSettings);

        this.scale = readU8(payload, 2, TemperatureScale.F);
        this.autoChangeoverEnabled = readU8(payload, 12, 0) === 1;
        this.deadband = readU8(payload, 13, 0);
        this.outdoorSensor = readU8(payload, 15, OutdoorSensorStatus.NotInstalled);
        this.awayEnabled = readU8(payload, 26, 0) === 1;
        this.heatBlastEnabled = readU8(payload, 27, 0) === 1;
        this.heatBlastOffset = readU8(payload, 28, 0);
        this.hvacServiceReminderMonths = readU8(payload, 34, 0);
        this.airFilterServiceReminderMonths = readU8(payload, 41, 0);
        this.waterPanelServiceReminderMonths = readU8(payload, 42, 0);
    }

    /** True when HVAC service reminder is installer-enabled (1–12 months). */
    get hvacServiceReminderEnabled(): boolean {
        return isServiceReminderEnabled(this.hvacServiceReminderMonths);
    }

    /** True when air-filter service reminder is installer-enabled (1–12 months). */
    get airFilterServiceReminderEnabled(): boolean {
        return isServiceReminderEnabled(this.airFilterServiceReminderMonths);
    }

    /** True when water-panel service reminder is installer-enabled (1–12 months). */
    get waterPanelServiceReminderEnabled(): boolean {
        return isServiceReminderEnabled(this.waterPanelServiceReminderMonths);
    }

    /**
     * Deadband separation in Celsius for auto heat/cool setpoints.
     * Guide: raw 0→1°C … 7→4.5°C (0.5°C steps starting at 1°C).
     */
    get deadbandCelsius(): number {
        return deadbandToCelsius(this.deadband);
    }
}

/**
 * Read a payload byte or `fallback` when the buffer is shorter than needed.
 * Installer packets vary slightly by model; short payloads must not throw.
 */
function readU8(payload: Buffer, offset: number, fallback: number): number {
    if (offset < 0 || offset >= payload.length)
        return fallback;
    return payload.readUint8(offset);
}

/**
 * Convert guide deadband enum (byte 13) to Celsius separation.
 * 0→1, 1→1.5, … 7→4.5. Out-of-range values return NaN (caller should not invent).
 */
export function deadbandToCelsius(deadband: number): number {
    if (!Number.isInteger(deadband) || deadband < 0 || deadband > 7)
        return Number.NaN;
    return 1 + deadband * 0.5;
}

/**
 * Service-reminder months encoding (guide §1.1 / §1.5–1.7):
 * enabled when value is 1–12 (interval in months); 0/13/reserved = not enabled.
 */
export function isServiceReminderEnabled(months: number | undefined | null): boolean {
    return typeof months === "number" && months >= 1 && months <= 12;
}

/**
 * Hold UI choices: drop Away when installer Away (#26) is disabled.
 * Pure helper for unit tests and getSettings gating.
 */
export function filterHoldChoicesForInstaller(
    choices: readonly string[],
    awayEnabled: boolean,
    awayLabel: string = "Away"
): string[] {
    if (awayEnabled)
        return [...choices];
    return choices.filter((c) => c !== awayLabel);
}

/**
 * Heat Blast storage setting is shown only when installer Heat Blast (#27) is enabled.
 * Pure helper for unit tests and getSettings gating.
 */
export function shouldShowHeatBlastSetting(heatBlastEnabled: boolean | undefined): boolean {
    return heatBlastEnabled === true;
}

export enum TemperatureScale {
    F = 0,
    C = 1
}

export enum OutdoorSensorStatus {
    NotInstalled = 0,
    Installed = 1,
    Automation = 2
}
