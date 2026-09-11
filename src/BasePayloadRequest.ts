import { FunctionalDomain, FunctionalDomainAttribute } from "./AprilaireClient";


export class BasePayloadRequest {
    domain: FunctionalDomain;
    attribute: FunctionalDomainAttribute;
    constructor(domain: FunctionalDomain, attribute: FunctionalDomainAttribute) {
        this.domain = domain;
        this.attribute = attribute;
    }

    /**
     * Write payload (Action=Write). Empty for read-only attributes.
     * Multi-field writes use 0 / Null to leave a sub-field unchanged.
     */
    toBuffer(): Buffer {
        return Buffer.alloc(0);
    }

    /**
     * Extra data for a Read Request. Empty for most attributes.
     *
     * Wiki (Actions & Transactions): Permanent Messages, Schedule Day, and
     * Support Modules require a selector byte after Action/Domain/Attribute.
     * Never send a write body on a read — incorrect size NACKs (`0x22`).
     */
    toReadBuffer(): Buffer {
        return Buffer.alloc(0);
    }
}
