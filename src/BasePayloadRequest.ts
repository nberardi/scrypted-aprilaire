import { FunctionalDomain, FunctionalDomainControl, FunctionalDomainIdentification, FunctionalDomainSensors, FunctionalDomainStatus, FunctionalDomainSetup, FunctionalDomainScheduling } from "./AprilaireClient";


export class BasePayloadRequest {
    domain: FunctionalDomain;
    attribute: number;
    constructor(domain: FunctionalDomain, attribute: FunctionalDomainControl | FunctionalDomainIdentification | FunctionalDomainScheduling | FunctionalDomainSensors | FunctionalDomainStatus | FunctionalDomainSetup) {
        this.domain = domain;
        this.attribute = attribute;
    }

    toBuffer(): Buffer {
        return Buffer.alloc(0);
    }
}
