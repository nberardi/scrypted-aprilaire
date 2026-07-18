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
* Date and Time                         |   0x04    |   No  |   R/W |   X
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
 * Setup §1.4 Date and Time (attribute 0x04) — write/read.
 *
 * Payload layout (7 data bytes per guide):
 *   Byte 0: Second     (0–59)
 *   Byte 1: Minute     (0–59)
 *   Byte 2: Hour       (0–23, 24-hour)
 *   Byte 3: Date       (1–31, day of month)
 *   Byte 4: Day        (0=Sunday … 6=Saturday; matches JS Date.getDay())
 *   Byte 5: Month      (1–12)
 *   Byte 6: Year−2000  (0–99 → calendar year 2000–2099)
 *
 * Timezone assumption: encode **local wall-clock time** of the host
 * (`Date#getHours`, `getDate`, …), **not** UTC. Thermostat schedules and
 * on-device display are local; writing UTC would shift schedule events by
 * the host UTC offset. Automation owns the thermostat clock (guide §J.3)
 * and should refresh at least monthly so onboard schedule events do not drift.
 */
export class DateAndTimeRequest extends BasePayloadRequest {
    second: number;
    minute: number;
    hour: number;
    /** Day of month 1–31 */
    date: number;
    /** Day of week: 0=Sunday … 6=Saturday */
    day: number;
    /** Month 1–12 */
    month: number;
    /** Years since 2000 (wire value 0–99) */
    year: number;

    constructor() {
        super(FunctionalDomain.Setup, FunctionalDomainSetup.DateAndTime);
    }

    /**
     * Fill fields from a Date using local wall-clock components (not UTC).
     */
    static fromLocalDate(localDate: Date): DateAndTimeRequest {
        const req = new DateAndTimeRequest();
        req.second = localDate.getSeconds();
        req.minute = localDate.getMinutes();
        req.hour = localDate.getHours();
        req.date = localDate.getDate();
        req.day = localDate.getDay(); // 0=Sunday … 6=Saturday
        req.month = localDate.getMonth() + 1; // JS 0-based → wire 1–12
        req.year = localDate.getFullYear() - 2000;
        return req;
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(7);
        payload.writeUint8(this.second, 0);
        payload.writeUint8(this.minute, 1);
        payload.writeUint8(this.hour, 2);
        payload.writeUint8(this.date, 3);
        payload.writeUint8(this.day, 4);
        payload.writeUint8(this.month, 5);
        payload.writeUint8(this.year, 6);
        return payload;
    }
}

export class DateAndTimeResponse extends BasePayloadResponse {
    second: number;
    minute: number;
    hour: number;
    /** Day of month 1–31 */
    date: number;
    /** Day of week: 0=Sunday … 6=Saturday */
    day: number;
    /** Month 1–12 */
    month: number;
    /** Years since 2000 (wire value 0–99) */
    year: number;
    /** Local Date reconstructed from wire fields (host timezone). */
    localDate: Date;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Setup, FunctionalDomainSetup.DateAndTime);

        this.second = payload.readUint8(0);
        this.minute = payload.readUint8(1);
        this.hour = payload.readUint8(2);
        this.date = payload.readUint8(3);
        this.day = payload.readUint8(4);
        this.month = payload.readUint8(5);
        this.year = payload.readUint8(6);

        // Reconstruct as local wall-clock (JS Date month is 0-based).
        this.localDate = new Date(
            this.year + 2000,
            Math.max(0, this.month - 1),
            this.date,
            this.hour,
            this.minute,
            this.second
        );
    }
}

export class ThermostatInstallerSettingsResponse extends BasePayloadResponse {
    scale: TemperatureScale;
    outdoorSensor: OutdoorSensorStatus;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Setup, FunctionalDomainSetup.ThermostatInstallSettings);

        this.scale = payload.readUint8(2);
        this.outdoorSensor = payload.readUint8(15);
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