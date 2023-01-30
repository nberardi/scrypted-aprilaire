import { FunctionalDomain, FunctionalDomainControl, FunctionalDomainIdentification, FunctionalDomainSensors, FunctionalDomainStatus, FunctionalDomainSetup } from "./AprilaireClient";


export class BasePayloadResponse {
    timestamp = Date.now;

    payload: Buffer;
    error: boolean;
    domain: FunctionalDomain;
    attribute: number;

    constructor(payload: Buffer, domain: FunctionalDomain, attribute: FunctionalDomainControl | FunctionalDomainIdentification | FunctionalDomainSensors | FunctionalDomainStatus | FunctionalDomainSetup) {
        this.payload = payload;
        this.error = false;

        this.domain = domain;
        this.attribute = attribute;
    }
}
