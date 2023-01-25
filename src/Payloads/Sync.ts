import { BasePayloadRequest } from "./BasePayload";

export class SyncRequest extends BasePayloadRequest {
    constructor() {
        super(FunctionalDomain.Status, FunctionalDomainStatus.Sync);
    }

    toBuffer(): Buffer {
        const payload = Buffer.alloc(1);
        payload.writeUInt8(1);
        return payload;
    }
}