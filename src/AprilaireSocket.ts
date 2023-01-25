import { Socket } from "net";
import crc from "crc";
import { AprilaireResponsePayload } from "./Payloads/AprilaireResponsePayload";
import { BasePayloadRequest, BasePayloadResponse } from "./Payloads/BasePayload";


export class AprilaireSocket {
    host: string;
    port: number;
    client: Socket;

    sequence: number;
    responseReceived: (response: BasePayloadResponse) => void;
    connected: () => void;
    disconnected: () => void;

    constructor(host: string, port: number) {
        this.host = host;
        this.port = port;

        this.setupSocket();
    }

    private setupSocket() {
        const self = this;
        this.client = new Socket();

        this.client.on("close", (hadError: boolean) => {
        });

        this.client.on("connect", () => {
            self.connected();
        });

        this.client.on("data", (data: Buffer) => {
        });

        this.client.on("drain", () => {
        });

        this.client.on("end", () => { 
            self.disconnected();
        });

        this.client.on("error", (err: Error) => {
            //_LOGGER.fatal(`Error: ${error}`);
        });

        this.client.on("lookup", (err: Error, address: string, family: string | number, host: string) => { });

        this.client.on("ready", () => { });

        this.client.on("timeout", () => { });
    }

    connect() {
        this.client.connect({ port: this.port, host: this.host });
    }

    private receivedData(data: Buffer) {
        const response = new AprilaireResponsePayload(data);

        this.responseReceived(response.toObject())
    }

    sendObjectRequest(action: Action, request: BasePayloadRequest) {
        this.sendCommand(action, request.domain, request.attribute, request.toBuffer());
    }

    sendRequest(action: Action, domain: FunctionalDomain, attribute: number) {
        this.sendCommand(action, domain, attribute);
    }

    private sendCommand(action: Action, domain: FunctionalDomain | number, attribute: number, data?: Buffer) {
        const header = Buffer.alloc(7);
        header.writeUint8(1), // protocol revisoin
        header.writeUint8(this.sequence); // message counter sequence
        header.writeUint16BE(3 + data.byteLength); // byte count of payload
        header.writeUint8(action); // action
        header.writeUint8(domain); // functional domain or status code
        header.writeUint8(attribute); // attribute being affected

        const payload = Buffer.concat([header, data], 3 + data.byteLength);
        const payloadCrc = crc.crc8(payload); // 8-bit CRC

        const frame = Buffer.alloc(payload.byteLength + 1, payload);
        frame.writeUint8(payloadCrc);

        //_LOGGER.debug(`Queuing data, sequence=${sequence}, action=${action}, functional_domain=${domain}, attribute=${attribute}`);
        // increment sequence for next command
        this.sequence = (this.sequence + 1) % 128;

        this.client.write(frame);
    }
}
