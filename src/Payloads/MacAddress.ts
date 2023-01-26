import { BasePayloadResponse } from ".";
import { FunctionalDomain, FunctionalDomainIdentification } from "../Constants";

export class MacAddressResponse extends BasePayloadResponse {
    macAddress: string;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Identification, FunctionalDomainIdentification.MacAddress);

        const macAddressBytes = payload.subarray(0, 5);
        this.macAddress = macAddressBytes.toString("hex");
    }
}