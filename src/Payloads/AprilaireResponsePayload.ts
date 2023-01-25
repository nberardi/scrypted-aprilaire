import { MacAddressResponse } from "./MacAddressResponse";
import { RevisionAndModelResponse } from "./RevisionAndModelResponse";
import { ThermostatNameResponse } from "./ThermostatName";

export class AprilaireResponsePayload {
    revision: number;
    sequence: number;
    length: number;
    action: Action;
    domain: FunctionalDomain;
    attribute: number;
    payload: Buffer;

    constructor(data: Buffer) {
        const { revision, sequence, length, action, domain, attribute } = this.decodeHeader(data);

        const payload: Buffer = data.subarray(7, length);

        this.revision = revision;
        this.sequence = sequence;
        this.length = length;
        this.action = action;
        this.domain = domain;
        this.attribute = attribute;
        this.payload = payload;
    }

    decodeHeader (data: Buffer) {
        try {
            const revision: number = data.readUint8(0);
            const sequence: number = data.readUint8(1);
            const length: number = data.readUint16BE(2);
            const action: Action = data.readUint8(4);
            const domain: FunctionalDomain = data.readUint8(5);
            const attribute: number = data.readUint8(6);
            return { revision, sequence, length, action, domain, attribute };
        } catch {
            return { revision: 1, sequence: 0, length: 0, action: Action.None, domain: FunctionalDomain.None, attribute: 0 };
        }
    }

    toObject(): any {
        if (this.action !== Action.ReadResponse)
            throw Error(`Recived an unrecognized acton: ${this.action}`)

        switch(this.domain) {
            case FunctionalDomain.Identification:
                switch(this.attribute) {
                    case FunctionalDomainIdentification.RevisionAndModel: 
                        return new RevisionAndModelResponse(this.payload);
                    case FunctionalDomainIdentification.MacAddress: 
                        return new MacAddressResponse(this.payload);
                    case FunctionalDomainIdentification.ThermostatName:
                        return new ThermostatNameResponse(this.payload);
                }
        }
    }
}

