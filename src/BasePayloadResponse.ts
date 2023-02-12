import { FunctionalDomain, FunctionalDomainControl, FunctionalDomainIdentification, FunctionalDomainSensors, FunctionalDomainStatus, FunctionalDomainSetup, FunctionalDomainScheduling } from "./AprilaireClient";


export class BasePayloadResponse {
    timestamp = Date.now;

    payload: Buffer;
    responseError: ResponseErrorType;
    domain: FunctionalDomain;
    attribute: number;

    constructor(payload: Buffer, domain: FunctionalDomain, attribute: FunctionalDomainControl | FunctionalDomainIdentification | FunctionalDomainScheduling | FunctionalDomainSensors | FunctionalDomainStatus | FunctionalDomainSetup) {
        this.payload = payload;
        this.responseError = ResponseErrorType.NoError;

        this.domain = domain;
        this.attribute = attribute;
    }
}

export enum ResponseErrorType {
    NoError = 0,
    PayloadMalformed = 1,
    NoPayloadReceived = 2
}