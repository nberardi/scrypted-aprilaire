
import { RevisionAndModelResponse, MacAddressResponse, ThermostatNameResponse, ThermostatSetpointAndModeSettingsResponse, ControllingSensorsStatusAndValueResponse, ThermostatAndIAQAvailableResponse, BasePayloadResponse, IAQStatusResponse, FreshAirSettingsResponse, AirCleaningSettingsResponse, DehumidificationSetpointResponse, HumidificationSetpointResponse } from ".";
import { Action, FunctionalDomain, FunctionalDomainControl, FunctionalDomainIdentification, FunctionalDomainSensors, FunctionalDomainSetup, FunctionalDomainStatus, generateCrc } from "../Constants";
import { ThermostatInstallerSettingsResponse } from "./ThermostatInstallerSettings";

export function parseResponse (data: Buffer) : AprilaireResponsePayload[] {
    let response: AprilaireResponsePayload[] = [];

    let workingData = data;
    let count = 0;
    let position = 0;
    while(true) {
        if (workingData.length === 0 || count > 50)
            break;
    
        const { revision, sequence, length, action, domain, attribute } = decodeHeader(workingData);
        const payload = workingData.subarray(7, 4 + length);
        const crc = workingData[4 + length];
        const crcCheck = generateCrc(workingData.subarray(0, 4 + length));

        console.assert(crc === crcCheck, `failed: crc check, expecting ${crcCheck} received ${crc}`);
        console.log(`position: ${position}, length: ${length}, action: ${Action[action]}, domain: ${FunctionalDomain[domain]}, attribute: ${attribute}, array: ${workingData.length}`)
    
        response.push(new AprilaireResponsePayload(revision, sequence, length, action, domain, attribute, payload, crc));

        const nextStart = 4 + length + 1;
        workingData = workingData.subarray(nextStart);
    
        position = position + nextStart;
        count++;
    }

    return response;
}

export function decodeHeader (data: Buffer) {
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

export class AprilaireResponsePayload {
    revision: number;
    sequence: number;
    length: number;
    action: Action;
    domain: FunctionalDomain;
    attribute: number;
    payload: Buffer;
    crc: number;

    constructor(revision: number, sequence: number, length: number, action: Action, domain: FunctionalDomain, attribute: number, payload: Buffer, crc: number) {
        this.revision = revision;
        this.sequence = sequence;
        this.length = length;
        this.action = action;
        this.domain = domain;
        this.attribute = attribute;
        this.payload = payload;
        this.crc = crc;
    }

    toObject(): any {
        if (this.action !== Action.ReadResponse && this.action !== Action.COS && this.action !== Action.NAck)
            throw Error(`Recived an unrecognized action: ${this.action}`)

        if (this.action == Action.NAck) {
            console.error(`NAck received, sequence=${this.sequence}, action=${this.action}, functional_domain=${this.domain}`);
            throw Error(`NAck received, sequence=${this.sequence}, action=${this.action}, nack=${this.domain}`);
        }

        switch(this.domain) {
            case FunctionalDomain.Setup:
                switch(this.attribute) {
                    case FunctionalDomainSetup.ThermostatInstallSettings:
                        return new ThermostatInstallerSettingsResponse(this.payload);
                }
                break;
            case FunctionalDomain.Identification:
                switch(this.attribute) {
                    case FunctionalDomainIdentification.RevisionAndModel: 
                        return new RevisionAndModelResponse(this.payload);
                    case FunctionalDomainIdentification.MacAddress: 
                        return new MacAddressResponse(this.payload);
                    case FunctionalDomainIdentification.ThermostatName:
                        return new ThermostatNameResponse(this.payload);
                }
                break;
            case FunctionalDomain.Control:
                switch(this.attribute) {
                    case FunctionalDomainControl.FreshAirSetting:
                        return new FreshAirSettingsResponse(this.payload);
                    case FunctionalDomainControl.AirCleaningSetting:
                        return new AirCleaningSettingsResponse(this.payload);
                    case FunctionalDomainControl.DehumidificationSetpoint:
                        return new DehumidificationSetpointResponse(this.payload);
                    case FunctionalDomainControl.HumidificationSetponit:
                        return new HumidificationSetpointResponse(this.payload);
                    case FunctionalDomainControl.ThermstateSetpointAndModeSettings:
                        return new ThermostatSetpointAndModeSettingsResponse(this.payload);
                    case FunctionalDomainControl.ThermostatAndIAQAvailable:
                        return new ThermostatAndIAQAvailableResponse(this.payload);
                }
                break;
            case FunctionalDomain.Status: 
                switch(this.attribute) {
                    case FunctionalDomainStatus.IAQStatus:
                        return new IAQStatusResponse(this.payload);
                }
                break;
            case FunctionalDomain.Sensors:
                switch(this.attribute) {
                    case FunctionalDomainSensors.ControllingSensorValues:
                        return new ControllingSensorsStatusAndValueResponse(this.payload);
                }
                break;
        }

        console.warn(`Recived an unrecognized domain: ${this.domain} and attribute: ${this.attribute}`);
        return new BasePayloadResponse(this.payload, this.domain, this.attribute);
    }
}