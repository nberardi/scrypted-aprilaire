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
* Schedule Settings                         |   0x01    |   Yes |   R/W |   
* Away Settings                             |   0x02    |   Yes |   R/W |   X
* Schedule Day                              |   0x03    |   Yes |   R/W |   
* Schedule Hold                             |   0x04    |   Yes |   R/W |   X
* Heat Blast                                |   0x05    |   Yes |   R/W |   X
*
*/

/** §3.4 payload: hold, fan, heat, cool, DEH, minute, hour, day, month, year−2000. */
export const SCHEDULE_HOLD_BYTE_COUNT = 10;

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
 * Schedule Hold read/COS (§3.4). Null (0) sub-fields become `undefined`
 * so a round-trip write stays Null. Day/month 0 means no end date.
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
 * Stable identity of a Schedule Hold for multi-stat sync echo suppression.
 * Uses local calendar fields (not Date#getTime) so COS round-trips match writes.
 */
export function scheduleHoldFingerprint(hold: {
    hold: HoldType;
    fan?: FanModeSetting;
    heatSetpoint?: number;
    coolSetpoint?: number;
    dehumidifierSetpoint?: number;
    endDate?: Date;
}): string {
    const end = hold.endDate;
    const endKey = end
        ? [
            end.getFullYear(),
            end.getMonth() + 1,
            end.getDate(),
            end.getHours(),
            end.getMinutes(),
        ].join("-")
        : "";
    return [
        hold.hold,
        hold.fan ?? "",
        hold.heatSetpoint ?? "",
        hold.coolSetpoint ?? "",
        hold.dehumidifierSetpoint ?? "",
        endKey,
    ].join("|");
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

        this.heatBlast = payload.readUint8(0) === 1;
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
        const payload = Buffer.alloc(3);
        payload.writeUint8(this.fan, 0);
        payload.writeUint8(nearestAwayIndex(AWAY_HEAT_SETPOINTS_C, this.heatSetpoint), 1);
        payload.writeUint8(nearestAwayIndex(AWAY_COOL_SETPOINTS_C, this.coolSetpoint), 2);
        return payload;
    }
}