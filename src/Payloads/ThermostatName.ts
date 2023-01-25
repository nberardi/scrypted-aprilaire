import { BasePayloadResponse } from "./BasePayload";

export class ThermostatNameResponse extends BasePayloadResponse {
    postalCode: string;
    name: string;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Identification, FunctionalDomainIdentification.ThermostatName);

        const postalCodeBytes = payload.subarray(0, 7);
        const nameBytes = payload.subarray(8, 8 + 15);

        this.postalCode = postalCodeBytes.toString("ascii");
        this.name = nameBytes.toString("ascii");
    }
}
