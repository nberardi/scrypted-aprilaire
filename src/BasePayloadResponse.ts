import { FunctionalDomain, FunctionalDomainControl, FunctionalDomainIdentification, FunctionalDomainSensors, FunctionalDomainStatus, FunctionalDomainSetup, FunctionalDomainScheduling, FunctionalDomainAlerts, NAckError } from "./AprilaireClient";


export class BasePayloadResponse {
    timestamp = Date.now;

    payload: Buffer;
    responseError: ResponseErrorType;
    domain: FunctionalDomain;
    attribute: number;

    constructor(payload: Buffer, domain: FunctionalDomain, attribute: FunctionalDomainControl | FunctionalDomainIdentification | FunctionalDomainScheduling | FunctionalDomainAlerts | FunctionalDomainSensors | FunctionalDomainStatus | FunctionalDomainSetup | number) {
        this.payload = payload;
        this.responseError = ResponseErrorType.NoError;

        this.domain = domain;
        this.attribute = attribute;
    }
}

/**
 * NACK is Action + StatusCode only (no functional domain / attribute).
 * Retry policy (caller responsibility):
 *   0x01, 0x03, 0x09 → retry up to 2 additional times with 0.5–1s delay
 *   all other codes → clear the transaction
 */
export class NackResponse extends BasePayloadResponse {
    statusCode: NAckError | number;

    constructor(statusCode: number) {
        super(Buffer.from([statusCode]), FunctionalDomain.NAck, statusCode);
        this.statusCode = statusCode;
    }

    /** Codes that should be retried before clearing the transaction */
    get shouldRetry(): boolean {
        return this.statusCode === NAckError.GenericError
            || this.statusCode === NAckError.BufferFullOrDeviceBusy
            || this.statusCode === NAckError.TimedOutWaitingForResponse;
    }
}

export enum ResponseErrorType {
    NoError = 0,
    PayloadMalformed = 1,
    NoPayloadReceived = 2
}