import { FunctionalDomain, FunctionalDomainAttribute } from "./AprilaireClient";


export class BasePayloadRequest {
    domain: FunctionalDomain;
    attribute: FunctionalDomainAttribute;
    constructor(domain: FunctionalDomain, attribute: FunctionalDomainAttribute) {
        this.domain = domain;
        this.attribute = attribute;
    }

    toBuffer(): Buffer {
        return Buffer.alloc(0);
    }
}
