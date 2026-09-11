import { FunctionalDomain, FunctionalDomainControl, FunctionalDomainIdentification, FunctionalDomainSensors, FunctionalDomainStatus, FunctionalDomainSetup, FunctionalDomainScheduling, FunctionalDomainAlerts } from "./AprilaireClient";


export class BasePayloadRequest {
    domain: FunctionalDomain;
    attribute: FunctionalDomainControl | FunctionalDomainIdentification | FunctionalDomainScheduling | FunctionalDomainSensors | FunctionalDomainStatus | FunctionalDomainSetup | FunctionalDomainAlerts;
    constructor(domain: FunctionalDomain, attribute: FunctionalDomainControl | FunctionalDomainIdentification | FunctionalDomainScheduling | FunctionalDomainSensors | FunctionalDomainStatus | FunctionalDomainSetup | FunctionalDomainAlerts) {
        this.domain = domain;
        this.attribute = attribute;
    }

    toBuffer(): Buffer {
        return Buffer.alloc(0);
    }
}
