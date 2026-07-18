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
 * Documented Installer Settings (§1.1) byte offsets used by this plugin.
 * Full parse is tracked separately (issue #19); only fields needed for runtime are here.
 */
export const InstallerSettingsByte = {
    /** Temperature Scale (#2): 0 = F, 1 = C */
    Scale: 2,
    /** Auto Changeover (#12): 0 = Disabled, 1 = Enabled. Deadband ignored when disabled. */
    AutoChangeover: 12,
    /**
     * Deadband (#13) — minimum heat/cool separation when Auto is enabled.
     * Index map (protocol): 0→1.0°C, 1→1.5°C (default 3°F), …, 7→4.5°C; 8–255 reserved.
     */
    Deadband: 13,
    /** Outdoor Sensor (#15): 0 NotInstalled, 1 Installed, 2 Automation */
    OutdoorSensor: 15,
} as const;

/**
 * Default deadband when installer settings have not been received yet.
 * Protocol default is index 1 = 3°F / 1.5°C (see §1.1 Deadband / §J.6).
 * Protocol layer always works in °C.
 */
export const DEFAULT_DEADBAND_C = 1.5;

/**
 * Decode Installer Settings deadband index (byte 13) to °C separation.
 * 0: 1.0°C (2°F), 1: 1.5°C (3°F, default), …, 7: 4.5°C (9°F).
 * Reserved/out-of-range indices fall back to {@link DEFAULT_DEADBAND_C}.
 */
export function deadbandIndexToCelsius(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index > 7) {
        return DEFAULT_DEADBAND_C;
    }
    // index 0 → 1.0°C, step 0.5°C
    return 1.0 + index * 0.5;
}

export class ThermostatInstallerSettingsResponse extends BasePayloadResponse {
    scale: TemperatureScale;
    outdoorSensor: OutdoorSensorStatus;
    /**
     * Auto Changeover (#12). Deadband enforcement applies when Auto is used;
     * protocol says deadband should be ignored when this is disabled.
     */
    autoChangeover: AutoChangeoverStatus;
    /** Raw deadband index from byte 13 (0–7 valid). */
    deadbandIndex: number;
    /** Deadband separation in °C (decoded from {@link deadbandIndex}). */
    deadbandC: number;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Setup, FunctionalDomainSetup.ThermostatInstallSettings);

        this.scale = payload.readUint8(InstallerSettingsByte.Scale);
        this.autoChangeover = payload.readUint8(InstallerSettingsByte.AutoChangeover);
        this.deadbandIndex = payload.readUint8(InstallerSettingsByte.Deadband);
        this.deadbandC = deadbandIndexToCelsius(this.deadbandIndex);
        this.outdoorSensor = payload.readUint8(InstallerSettingsByte.OutdoorSensor);
    }
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

export enum AutoChangeoverStatus {
    Disabled = 0,
    Enabled = 1
}