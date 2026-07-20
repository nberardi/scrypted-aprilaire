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

export class ScheduleHoldRequest extends BasePayloadRequest {
    hold: HoldType = HoldType.Disabled;
    fan: FanModeSetting;
    heatSetpoint: number;
    coolSetpoint: number;
    dehumidifierSetpoint: number;
    endDate: Date;
    constructor() {
        super(FunctionalDomain.Scheduling, FunctionalDomainScheduling.ScheduleHold);
    }

    /**
     * Hold payload is 10 data bytes:
     * hold, fan, heat, cool, DEH, minute, hour, date(1–31), month(1–12), year−2000
     */
    toBuffer(): Buffer {
        const endDate = this.endDate;

        const payload = Buffer.alloc(10);
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
        payload.writeUint8(endDate ? endDate.getFullYear() - 2000 : 0, 9);
        return payload;
    }
}

export class ScheduleHoldResponse extends BasePayloadResponse {
    hold: HoldType;
    fan: FanModeSetting;
    heatSetpoint: number;
    coolSetpoint: number ;
    dehumidifierSetpoint: number;
    endDate: Date;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Scheduling, FunctionalDomainScheduling.ScheduleHold);

        this.hold = payload.readUint8(0);
        this.fan = payload.readUint8(1);
        this.heatSetpoint = convertByteToTemperature(payload.readUint8(2));
        this.coolSetpoint = convertByteToTemperature(payload.readUint8(3));
        this.dehumidifierSetpoint = payload.readUint8(4);

        const minute = payload.readUint8(5);
        const hour = payload.readUint8(6);
        const day = payload.readUint8(7);
        const month = payload.readUint8(8); // 1–12 on wire
        const year = payload.readUint8(9);

        // JS Date month is 0-based
        this.endDate = new Date(year + 2000, Math.max(0, month - 1), day, hour, minute);
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
    heatBlast: boolean;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Scheduling, FunctionalDomainScheduling.HeatBlast);

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