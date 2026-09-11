import { FunctionalDomain, convertTemperatureToByte, FunctionalDomainScheduling, convertByteToTemperature } from "./AprilaireClient";
import { BasePayloadRequest } from "./BasePayloadRequest";
import { BasePayloadResponse } from "./BasePayloadResponse";
import { FanModeSetting } from "./FunctionalDomainControl";

/*
*
* Functional Domain: Scheduling
* Byte: 0x03
*
* Attribute                                 |   Byte    |   COS |   R/W |   Implimented
* ------------------------------------------|-----------|-------|-------|---------------
* Schedule Settings                         |   0x01    |   Yes |   R/W |   X
* Away Settings                             |   0x02    |   Yes |   R/W |   X
* Schedule Day                              |   0x03    |   Yes |   R/W |   X
* Schedule Hold                             |   0x04    |   Yes |   R/W |   X
* Heat Blast                                |   0x05    |   Yes |   R/W |   X
*
*/

/** §3.4 payload: hold, fan, heat, cool, DEH, minute, hour, day, month, year−2000. */
export const SCHEDULE_HOLD_BYTE_COUNT = 10;
/** Schedule Settings §3.1 — 1 byte program type. */
export enum ScheduleProgramType {
    Programmable = 0,
    NonProgrammable = 1
}

export class ScheduleSettingsRequest extends BasePayloadRequest {
    programType: ScheduleProgramType = ScheduleProgramType.Programmable;

    constructor() {
        super(FunctionalDomain.Scheduling, FunctionalDomainScheduling.ScheduleSettings);
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(1);
        payload.writeUint8(this.programType ?? ScheduleProgramType.Programmable, 0);
        return payload;
    }
}

export class ScheduleSettingsResponse extends BasePayloadResponse {
    programType: ScheduleProgramType;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Scheduling, FunctionalDomainScheduling.ScheduleSettings);
        this.programType = payload.readUint8(0);
    }
}

/**
 * Schedule Day §3.3 byte 0. 0–6 are Sunday–Saturday (valid on read).
 * 7–9 are write-only bulk selectors.
 */
export enum ScheduleDayIndex {
    Sunday = 0,
    Monday = 1,
    Tuesday = 2,
    Wednesday = 3,
    Thursday = 4,
    Friday = 5,
    Saturday = 6,
    Weekdays = 7,
    Weekend = 8,
    AllDays = 9
}

/** One of Wake / Leave / Return / Sleep — 5 bytes on the wire. */
export interface ScheduleEvent {
    startMinute: number;
    startHour: number;
    fan: FanModeSetting;
    heatSetpoint: number;
    coolSetpoint: number;
}

function emptyScheduleEvent(): ScheduleEvent {
    return {
        startMinute: 0,
        startHour: 0,
        fan: FanModeSetting.Auto,
        heatSetpoint: 0,
        coolSetpoint: 0,
    };
}

function writeScheduleEvent(payload: Buffer, offset: number, event: ScheduleEvent): void {
    payload.writeUint8(event.startMinute ?? 0, offset);
    payload.writeUint8(event.startHour ?? 0, offset + 1);
    payload.writeUint8(event.fan ?? FanModeSetting.Auto, offset + 2);
    payload.writeUint8(event.heatSetpoint ? convertTemperatureToByte(event.heatSetpoint) : 0, offset + 3);
    payload.writeUint8(event.coolSetpoint ? convertTemperatureToByte(event.coolSetpoint) : 0, offset + 4);
}

function readScheduleEvent(payload: Buffer, offset: number): ScheduleEvent {
    return {
        startMinute: payload.readUint8(offset),
        startHour: payload.readUint8(offset + 1),
        fan: payload.readUint8(offset + 2),
        heatSetpoint: convertByteToTemperature(payload.readUint8(offset + 3)),
        coolSetpoint: convertByteToTemperature(payload.readUint8(offset + 4)),
    };
}

/**
 * Read Schedule Day — 1-byte selector (0–6 Sunday–Saturday).
 * Wiki: Read Request data is required; weekdays/weekend/all-days are write-only.
 */
export class ScheduleDayReadRequest extends BasePayloadRequest {
    day: ScheduleDayIndex = ScheduleDayIndex.Sunday;

    constructor(day: ScheduleDayIndex = ScheduleDayIndex.Sunday) {
        super(FunctionalDomain.Scheduling, FunctionalDomainScheduling.ScheduleDay);
        this.day = day;
    }

    toReadBuffer(): Buffer {
        return Buffer.from([this.day]);
    }
}

/**
 * Write Schedule Day — 21 bytes: day + four 5-byte events (Wake, Leave, Return, Sleep).
 * Deadband violations NACK (unlike Setpoint & Mode, which auto-corrects).
 */
export class ScheduleDayRequest extends BasePayloadRequest {
    day: ScheduleDayIndex = ScheduleDayIndex.Sunday;
    wake: ScheduleEvent = emptyScheduleEvent();
    leave: ScheduleEvent = emptyScheduleEvent();
    returnHome: ScheduleEvent = emptyScheduleEvent();
    sleep: ScheduleEvent = emptyScheduleEvent();

    constructor() {
        super(FunctionalDomain.Scheduling, FunctionalDomainScheduling.ScheduleDay);
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(21);
        payload.writeUint8(this.day, 0);
        writeScheduleEvent(payload, 1, this.wake);
        writeScheduleEvent(payload, 6, this.leave);
        writeScheduleEvent(payload, 11, this.returnHome);
        writeScheduleEvent(payload, 16, this.sleep);
        return payload;
    }
}

export class ScheduleDayResponse extends BasePayloadResponse {
    day: ScheduleDayIndex;
    wake: ScheduleEvent;
    leave: ScheduleEvent;
    returnHome: ScheduleEvent;
    sleep: ScheduleEvent;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Scheduling, FunctionalDomainScheduling.ScheduleDay);

        const data = payload.length >= 21
            ? payload
            : Buffer.concat([payload, Buffer.alloc(21 - payload.length)]);

        this.day = data.readUint8(0);
        this.wake = readScheduleEvent(data, 1);
        this.leave = readScheduleEvent(data, 6);
        this.returnHome = readScheduleEvent(data, 11);
        this.sleep = readScheduleEvent(data, 16);
    }
}

export class ScheduleHoldRequest extends BasePayloadRequest {
    hold: HoldType = HoldType.Disabled;
    fan?: FanModeSetting;
    heatSetpoint?: number;
    coolSetpoint?: number;
    dehumidifierSetpoint?: number;
    endDate?: Date;
    constructor() {
        super(FunctionalDomain.Scheduling, FunctionalDomainScheduling.ScheduleHold);
    }

    /**
     * Hold payload is 10 data bytes:
     * hold, fan, heat, cool, DEH, minute, hour, date(1–31), month(1–12), year−2000
     */
    toBuffer(): Buffer {
        const endDate = this.endDate;

        const payload = Buffer.alloc(SCHEDULE_HOLD_BYTE_COUNT);
        payload.writeUint8(this.hold ?? HoldType.Disabled, 0);
        payload.writeUint8(this.fan ?? 0, 1);
        // 0 on the wire = Null (do not modify) when the field is omitted
        payload.writeUint8(convertTemperatureToByte(this.heatSetpoint ?? 0), 2);
        payload.writeUint8(convertTemperatureToByte(this.coolSetpoint ?? 0), 3);
        payload.writeUint8(this.dehumidifierSetpoint ?? 0, 4);
        payload.writeUint8(endDate?.getMinutes() ?? 0, 5);
        payload.writeUint8(endDate?.getHours() ?? 0, 6);
        payload.writeUint8(endDate?.getDate() ?? 0, 7);              // day of month 1–31
        payload.writeUint8(endDate ? endDate.getMonth() + 1 : 0, 8); // month 1–12
        // The wire carries year − 2000 in one byte; keep it in range so a bad
        // Date cannot throw out of a write path.
        payload.writeUint8(
            endDate ? Math.min(255, Math.max(0, endDate.getFullYear() - 2000)) : 0,
            9
        );
        return payload;
    }
}

/**
 * Schedule Hold read/COS (§3.4).
 *
 * Every field except the hold type may arrive as Null (0): Disabled, Permanent
 * and Away holds carry no end date, and setpoints are Null when the hold does
 * not override them. Null fields are surfaced as `undefined` so they round-trip
 * back to Null on a write.
 *
 * Decoding Null date bytes as a calendar date produced `new Date(2000, -1, 0)` —
 * 31 Dec 1999 — which the plugin's multi-thermostat hold sync then re-encoded as
 * day 31 / month 12 / year byte 255, broadcasting a wire-invalid end date to
 * every peer thermostat.
 */
export class ScheduleHoldResponse extends BasePayloadResponse {
    hold: HoldType = HoldType.Disabled;
    /** Undefined when the wire field is Null (do not modify). */
    fan?: FanModeSetting;
    heatSetpoint?: number;
    coolSetpoint?: number;
    dehumidifierSetpoint?: number;
    /** Undefined for holds without an end time (Disabled / Permanent / Away). */
    endDate?: Date;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Scheduling, FunctionalDomainScheduling.ScheduleHold);

        if (!this.hasRequiredLength(SCHEDULE_HOLD_BYTE_COUNT))
            return;

        this.hold = payload.readUint8(0);

        const fan = payload.readUint8(1);
        this.fan = fan === FanModeSetting.Null ? undefined : fan;

        const heat = payload.readUint8(2);
        this.heatSetpoint = heat === 0 ? undefined : convertByteToTemperature(heat);

        const cool = payload.readUint8(3);
        this.coolSetpoint = cool === 0 ? undefined : convertByteToTemperature(cool);

        const dehumidifier = payload.readUint8(4);
        this.dehumidifierSetpoint = dehumidifier === 0 ? undefined : dehumidifier;

        const minute = payload.readUint8(5);
        const hour = payload.readUint8(6);
        const day = payload.readUint8(7);      // day of month 1–31, 0 = Null
        const month = payload.readUint8(8);    // 1–12 on wire, 0 = Null
        const year = payload.readUint8(9);     // year − 2000

        // Day and month are 1-based on the wire, so either being 0 means the
        // thermostat sent no end date at all.
        if (day >= 1 && month >= 1 && month <= 12) {
            // JS Date month is 0-based
            this.endDate = new Date(year + 2000, month - 1, day, hour, minute);
        }
    }
}

export enum HoldType {
    Disabled = 0,
    Temporary = 1,
    Permanent = 2,
    Away = 3,
    Vacation = 4
}

/** UI choice labels for the Temperature Hold setting (StorageSettings). */
export const HOLD_UI = {
    Schedule: "Schedule",
    Temporary: "Temporary",
    Permanent: "Permanent",
    Away: "Away",
    Vacation: "Vacation",
} as const;

export type HoldUiValue = (typeof HOLD_UI)[keyof typeof HOLD_UI];

/**
 * Optional fields when building a Schedule Hold write.
 * Omitted / undefined fields serialize as 0 on the wire (Null = do not modify),
 * except hold itself which is always written.
 */
export interface BuildScheduleHoldOptions {
    fan?: FanModeSetting;
    heatSetpoint?: number;
    coolSetpoint?: number;
    dehumidifierSetpoint?: number;
    /** Required for Temporary and Vacation holds (minute/hour/day/month/year−2000). */
    endDate?: Date;
}

/**
 * Map Settings UI string → HoldType.
 * "Schedule" is the cancel / follow-schedule choice (Disabled on the wire).
 */
export function holdUiValueToHoldType(value: string): HoldType | undefined {
    switch (value) {
        case HOLD_UI.Schedule: return HoldType.Disabled;
        case HOLD_UI.Temporary: return HoldType.Temporary;
        case HOLD_UI.Permanent: return HoldType.Permanent;
        case HOLD_UI.Away: return HoldType.Away;
        case HOLD_UI.Vacation: return HoldType.Vacation;
        default: return undefined;
    }
}

/** Map HoldType from COS/read response → Settings UI string. */
export function holdTypeToUiValue(type: HoldType): HoldUiValue {
    switch (type) {
        case HoldType.Disabled: return HOLD_UI.Schedule;
        case HoldType.Temporary: return HOLD_UI.Temporary;
        case HoldType.Permanent: return HOLD_UI.Permanent;
        case HoldType.Away: return HOLD_UI.Away;
        case HoldType.Vacation: return HOLD_UI.Vacation;
        default: return HOLD_UI.Schedule;
    }
}

/**
 * Pure builder: UI hold choice (+ optional context) → ScheduleHoldRequest.
 *
 * Wire rules (Guide §3.4):
 * - Cancel (Schedule): hold=Disabled, all other fields Null (0)
 * - Temporary: hold type + end date; fan/setpoints when provided
 * - Permanent: hold type + fan/setpoints as applicable
 * - Away / Vacation: hold type + fan/setpoints; Vacation also needs end date
 */
export function buildScheduleHoldRequest(
    uiValue: string,
    options: BuildScheduleHoldOptions = {},
): ScheduleHoldRequest {
    const hold = holdUiValueToHoldType(uiValue);
    if (hold === undefined) {
        throw new Error(`Unknown hold UI value: ${uiValue}`);
    }

    const request = new ScheduleHoldRequest();
    request.hold = hold;

    // Cancel: leave fan/setpoints/endDate unset → toBuffer writes zeros (Null)
    if (hold === HoldType.Disabled) {
        return request;
    }

    if (options.fan !== undefined) {
        request.fan = options.fan;
    }
    if (options.heatSetpoint !== undefined) {
        request.heatSetpoint = options.heatSetpoint;
    }
    if (options.coolSetpoint !== undefined) {
        request.coolSetpoint = options.coolSetpoint;
    }
    if (options.dehumidifierSetpoint !== undefined) {
        request.dehumidifierSetpoint = options.dehumidifierSetpoint;
    }

    // Temporary and Vacation require an end date on the wire
    if (hold === HoldType.Temporary || hold === HoldType.Vacation) {
        request.endDate = options.endDate;
    }

    return request;
}

export class HeatBlastRequest extends BasePayloadRequest {
    heatBlast: boolean;
    constructor() {
        super(FunctionalDomain.Scheduling, FunctionalDomainScheduling.HeatBlast);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(1);
        payload.writeUint8(Number(this.heatBlast), 0);
        return payload;
    }
}

export class HeatBlastResponse extends BasePayloadResponse {
    heatBlast: boolean = false;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Scheduling, FunctionalDomainScheduling.HeatBlast);

        if (!this.hasRequiredLength(1))
            return;

        this.heatBlast = Boolean(payload.readUint8(0));
    }
}

/** Away Settings heat setpoint by wire index (guide §3.2). */
export const AWAY_HEAT_SETPOINTS_C = [15.5, 16, 16.5, 17, 17.5, 18.5] as const;
/** Away Settings cool setpoint by wire index (guide §3.2). */
export const AWAY_COOL_SETPOINTS_C = [26.5, 27, 27.5, 28.5, 29, 29.5] as const;

/** Nearest wire index for a Celsius value; ties round up. */
function nearestAwayIndex(values: readonly number[], celsius: number): number {
    let best = 0;
    for (let i = 1; i < values.length; i++) {
        if (Math.abs(values[i] - celsius) <= Math.abs(values[best] - celsius))
            best = i;
    }
    return best;
}

export class AwaySettingsResponse extends BasePayloadResponse {
    fan: FanModeSetting;
    heatSetpoint: number;
    coolSetpoint: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Scheduling, FunctionalDomainScheduling.AwaySettings);

        if (!this.hasRequiredLength(3))
            return;

        this.fan = payload.readUint8(0);
        // Clamp out-of-range wire indices to the table bounds so the parsed
        // setpoints are always numbers, never undefined.
        const heatIndex = Math.min(payload.readUint8(1), AWAY_HEAT_SETPOINTS_C.length - 1);
        const coolIndex = Math.min(payload.readUint8(2), AWAY_COOL_SETPOINTS_C.length - 1);
        this.heatSetpoint = AWAY_HEAT_SETPOINTS_C[heatIndex];
        this.coolSetpoint = AWAY_COOL_SETPOINTS_C[coolIndex];
    }
}

export class AwaySettingsRequest extends BasePayloadRequest {
    fan: FanModeSetting
    heatSetpoint: number;
    coolSetpoint: number;
    constructor() {
        super(FunctionalDomain.Scheduling, FunctionalDomainScheduling.AwaySettings);
    }

    toBuffer(): Buffer {
        if (!Number.isFinite(this.heatSetpoint) || this.heatSetpoint < 15.5 || this.heatSetpoint > 18.5) {
            throw new Error("Heat setpoint must be between 15.5 and 18.5");
        }

        if (!Number.isFinite(this.coolSetpoint) || this.coolSetpoint < 26.5 || this.coolSetpoint > 29.5) {
            throw new Error("Cool setpoint must be between 26.5 and 29.5");
        }

        let payload = Buffer.alloc(3);
        payload.writeUint8(this.fan, 0);
        // The wire encodes only the 6 indexed values; valid-range inputs can
        // fall off the 0.5° grid (e.g. unit-converted UI values), so snap to
        // the nearest table entry instead of an exact-key lookup.
        payload.writeUint8(nearestAwayIndex(AWAY_HEAT_SETPOINTS_C, this.heatSetpoint), 1);
        payload.writeUint8(nearestAwayIndex(AWAY_COOL_SETPOINTS_C, this.coolSetpoint), 2);
        return payload;
    }
}