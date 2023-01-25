export class BasePayloadRequest {
    domain: FunctionalDomain;
    attribute: number;
    constructor(domain: FunctionalDomain, attribute: FunctionalDomainControl | FunctionalDomainIdentification | FunctionalDomainSensors | FunctionalDomainStatus) {
        this.domain = domain;
        this.attribute = attribute;
    }

    toBuffer() : Buffer { 
        return Buffer.alloc(0);
    }
}

export class BasePayloadResponse {
    payload: Buffer;
    error: boolean;
    domain: FunctionalDomain;
    attribute: number;

    constructor(payload: Buffer, domain: FunctionalDomain, attribute: FunctionalDomainControl | FunctionalDomainIdentification | FunctionalDomainSensors | FunctionalDomainStatus) {
        this.payload = payload;
        this.error = false;

        this.domain = domain;
        this.attribute = attribute;
    }
}
