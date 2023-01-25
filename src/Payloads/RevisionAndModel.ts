import { BasePayloadResponse } from "./BasePayload";

export class RevisionAndModelResponse extends BasePayloadResponse {
    hardware: number;
    firmwareMajor: number;
    firmwareMinor: number;
    protocolMajor: number;
    model: number;
    gainspanFirmwareMajor: number;
    gainspanFirmwareMinor: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Identification, FunctionalDomainIdentification.RevisionAndModel);

        this.hardware = payload.readUint8(0);
        this.firmwareMajor = payload.readUint8(1);
        this.firmwareMinor = payload.readUint8(2);
        this.protocolMajor = payload.readUint8(3);
        this.model = payload.readUint8(4);
        this.gainspanFirmwareMajor = payload.readUint8(5);
        this.gainspanFirmwareMinor = payload.readUint8(6);
    }
}
