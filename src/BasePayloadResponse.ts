import { FunctionalDomain, FunctionalDomainAttribute, NAckError } from "./AprilaireClient";


export class BasePayloadResponse {
    timestamp = Date.now();

    payload: Buffer;
    responseError: ResponseErrorType;
    domain: FunctionalDomain;
    attribute: number;

    constructor(payload: Buffer, domain: FunctionalDomain, attribute: FunctionalDomainAttribute) {
        this.payload = payload;
        this.responseError = ResponseErrorType.NoError;

        this.domain = domain;
        this.attribute = attribute;
    }

    /** Flag truncated/empty payloads instead of throwing from a subclass constructor. */
    protected hasRequiredLength(requiredBytes: number): boolean {
        if (!this.payload || this.payload.length === 0) {
            this.responseError = ResponseErrorType.NoPayloadReceived;
            return false;
        }

        if (this.payload.length < requiredBytes) {
            this.responseError = ResponseErrorType.PayloadMalformed;
            return false;
        }

        return true;
    }
}

/**
 * NACK is Action + StatusCode only (no functional domain / attribute).
 * Retry: 0x01, 0x03, 0x09 — twice, 0.5–1s. All other codes clear.
 */
export class NackResponse extends BasePayloadResponse {
    statusCode: NAckError | number;
    /** Sequence from the NACK frame (correlates to the outbound request). */
    sequence?: number;

    constructor(statusCode: number, sequence?: number) {
        super(Buffer.from([statusCode]), FunctionalDomain.None, statusCode);
        this.statusCode = statusCode;
        this.sequence = sequence;
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