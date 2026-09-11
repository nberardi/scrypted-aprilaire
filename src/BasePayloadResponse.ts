import { FunctionalDomain, FunctionalDomainAttribute, NAckError } from "./AprilaireClient";


/**
 * Read one payload byte, or `fallback` when the buffer is missing/short.
 * Thermostat frames vary by model; short COS/read bodies must not throw.
 *
 * Use this only where the record is genuinely variable-length by model
 * (Installer Settings is 44–56 bytes), so a missing trailing byte is expected
 * rather than a fault. For fixed-length records a short payload means the data
 * is untrustworthy, so guard with {@link BasePayloadResponse.hasRequiredLength}
 * and let the device layer discard the response instead of absorbing defaults
 * it cannot tell apart from real readings.
 */
export function readPayloadU8(payload: Buffer | undefined, offset: number, fallback: number = 0): number {
    if (!payload || offset < 0 || offset >= payload.length)
        return fallback;
    return payload.readUint8(offset);
}

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

    /**
     * Guard fixed-length parsers against truncated payloads.
     *
     * A subclass that reads past the end of its buffer throws `ERR_OUT_OF_RANGE`
     * from its own constructor, which loses the whole frame and tells callers
     * nothing. Flagging {@link ResponseErrorType.PayloadMalformed} instead keeps a
     * usable object: consumers already gate on `responseError`.
     *
     * @returns true when the payload is long enough to parse.
     */
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
 * Retry policy (OutboundRequestQueue / Guide §H.5):
 *   0x01, 0x03, 0x09 → retry up to 2 additional times with 0.5–1s delay
 *   all other codes → clear the transaction
 */
export class NackResponse extends BasePayloadResponse {
    statusCode: NAckError | number;
    /** Sequence from the NACK frame (correlates to the outbound request). */
    sequence?: number;

    constructor(statusCode: number, sequence?: number) {
        super(Buffer.from([statusCode]), FunctionalDomain.NAck, statusCode);
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