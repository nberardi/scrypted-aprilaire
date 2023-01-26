import { RevisionAndModelResponse, MacAddressResponse, ThermostatNameResponse, ThermostatMode, ThermostatSetpointAndModeSettingsResponse, ControllingSensorsStatusAndValueResponse, ThermostatAndIAQAvailableResponse, BasePayloadResponse, IAQStatusResponse } from ".";
import { Action, NAckError, FunctionalDomain, FunctionalDomainControl, FunctionalDomainIdentification, FunctionalDomainSensors, FunctionalDomainStatus } from "../Constants";

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

        const payload: Buffer = data.subarray(7, 7 + length);

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
        if (this.action !== Action.ReadResponse && this.action !== Action.COS && this.action !== Action.NAck)
            throw Error(`Recived an unrecognized action: ${this.action}`)

        if (this.action == Action.NAck) {
            console.error(`NAck received, sequence=${this.sequence}, action=${this.action}, functional_domain=${this.domain}`);
            throw Error(`NAck received, sequence=${this.sequence}, action=${this.action}, nack=${this.domain}`);
        }

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
            case FunctionalDomain.Control:
                switch(this.attribute) {
                    case FunctionalDomainControl.ThermstateSetpointAndModeSettings:
                        return new ThermostatSetpointAndModeSettingsResponse(this.payload);
                    case FunctionalDomainControl.ThermostatAndIAQAvailable:
                        return new ThermostatAndIAQAvailableResponse(this.payload);
                }
            case FunctionalDomain.Status: 
                switch(this.attribute) {
                    case FunctionalDomainStatus.IAQStatus:
                        return new IAQStatusResponse(this.payload);
                }
            case FunctionalDomain.Sensors:
                switch(this.attribute) {
                    case FunctionalDomainSensors.ControllingSensorValues:
                        return new ControllingSensorsStatusAndValueResponse(this.payload);
                }
            default:
                console.warn(`Recived an unrecognized domain: ${this.domain} and attribute: ${this.attribute}`);
                return new BasePayloadResponse(this.payload, this.domain, this.attribute);
        }
    }
}