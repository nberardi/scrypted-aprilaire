import { FunctionalDomain, convertTemperatureToByte, FunctionalDomainScheduling, convertByteToTemperature } from "./AprilaireClient";
import { BasePayloadRequest } from "./BasePayloadRequest";
import { BasePayloadResponse } from "./BasePayloadResponse";
import { FanModeSetting } from "./FunctionalDomainControl";

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

    toBuffer(): Buffer {
        let endDate = this.endDate;

        let payload = Buffer.alloc(9);
        payload.writeUint8(this.hold ?? 0, 0);
        payload.writeUint8(this.fan ?? 0, 1);
        payload.writeUint8(convertTemperatureToByte(this.heatSetpoint ?? 0), 2); 
        payload.writeUint8(convertTemperatureToByte(this.coolSetpoint ?? 0), 3); 
        payload.writeUint8(this.dehumidifierSetpoint ?? 0, 4);
        payload.writeUint8(endDate?.getMinutes() ?? 0, 5);
        payload.writeUint8(endDate?.getHours()  ?? 0, 6);
        payload.writeUint8(endDate?.getDay() ?? 0, 7);
        payload.writeUint8(endDate?.getMonth() ?? 0, 8);
        payload.writeUint8((endDate?.getFullYear() - 2000) ?? 0, 9);
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
        super(payload, FunctionalDomain.Sensors, FunctionalDomainScheduling.ScheduleHold);

        this.hold = payload.readUint8(0);
        this.fan = payload.readUint8(1);
        this.heatSetpoint = convertByteToTemperature(payload.readUint8(2));
        this.coolSetpoint = convertTemperatureToByte(payload.readUint8(3));
        this.dehumidifierSetpoint = payload.readUint8(4);

        let minute = payload.readUint8(5);
        let hour = payload.readUint8(6);
        let day = payload.readUint8(7);
        let month = payload.readUint8(8);
        let year = payload.readUint8(9);

        this.endDate = new Date(year + 2000, month, day, hour, minute);
    }
}

export enum HoldType {
    Disabled = 0,
    Temporary = 1,
    Permanent = 2,
    Away = 3,
    Vacation = 4
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
        super(payload, FunctionalDomain.Sensors, FunctionalDomainScheduling.HeatBlast);

        this.heatBlast = Boolean(payload.readUint8(0));
    }
}
