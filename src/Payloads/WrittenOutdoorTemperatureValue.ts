import { BasePayloadRequest } from ".";
import { FunctionalDomain, FunctionalDomainControl, FunctionalDomainSensors, convertTemperatureToByte } from "../Constants";

export class WrittenOutdoorTemperatureValueRequest extends BasePayloadRequest {
    status: number = 0;
    temperature: number = 0;
    constructor() {
        super(FunctionalDomain.Sensors, FunctionalDomainSensors.WrittenOutdoorTempValue);
    }

    toBuffer(): Buffer {
        let payload = Buffer.alloc(2);
        payload.writeUint8(0, 0);
        payload.writeUint8(this.temperature ? convertTemperatureToByte(this.temperature) : 0, 1);
        return payload;
    }
}
