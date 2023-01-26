import { Socket } from "net";
import crc from "crc";
import { AprilaireResponsePayload, BasePayloadRequest, BasePayloadResponse } from "./payloads";
import { Action, FunctionalDomain } from "./Constants";
import EventEmitter from "events";

export class AprilaireSocket extends EventEmitter {
    host: string;
    port: number;
    private client: Socket;

    private sequence: number = 0;

    constructor(host: string, port: number) {
        super();

        this.host = host;
        this.port = port;
    }

    private setupSocket() {
        const self = this;
        this.client = new Socket();

        this.client.on("close", (hadError: boolean) => {
            console.debug("socket close");
        });

        this.client.on("connect", () => {
            console.debug("socket connect");
        });

        this.client.on("data", (data: Buffer) => {
            console.debug(`socket data: ${data.toString("hex")}`);

            const response = new AprilaireResponsePayload(data);
            const payload = response.toObject();
            
            self.emit('response', payload);
        });

        this.client.on("drain", () => {
            console.debug("socket drain");
        });

        this.client.on("end", () => { 
            console.debug("socket end");

            self.emit('disconnected');
        });

        this.client.on("error", (err: Error) => {
            console.debug(`socket error: ${err}`);
        });

        this.client.on("lookup", (err: Error, address: string, family: string | number, host: string) => { 
            console.debug(`socket lookout: err: ${err}, address: ${address}, family: ${family}, host: ${host}`);
        });

        this.client.on("ready", () => { 
            console.debug("socket ready");
            self.emit('connected');
        });

        this.client.on("timeout", () => { 
            console.debug("socket timeout");
        });
    }

    connect() {
        this.setupSocket();
        this.client.connect({ port: this.port, host: this.host });
    }

    disconnect() {
        this.client.destroy();
    }

    sendObjectRequest(action: Action, request: BasePayloadRequest) {
        this.sendCommand(action, request.domain, request.attribute, request.toBuffer());
    }

    sendRequest(action: Action, domain: FunctionalDomain, attribute: number) {
        this.sendCommand(action, domain, attribute);
    }

    private sendCommand(action: Action, domain: FunctionalDomain | number, attribute: number, data: Buffer = Buffer.alloc(0)) {
        const header = Buffer.alloc(7);
        header.writeUint8(1, 0), // protocol revisoin
        header.writeUint8(this.sequence, 1); // message counter sequence
        header.writeUint16BE(3 + data.byteLength, 2); // byte count of payload
        header.writeUint8(action, 4); // action
        header.writeUint8(domain, 5); // functional domain or status code
        header.writeUint8(attribute, 6); // attribute being affected

        const payload = Buffer.concat([header, data], header.byteLength + data.byteLength);
        const payloadCrc = crc.crc8(payload); // 8-bit CRC

        const frame = Buffer.alloc(payload.byteLength + 1, payload);
        frame.writeUint8(payloadCrc, frame.byteLength - 1);

        console.debug(`Queuing data, sequence=${this.sequence}, action=${action}, functional_domain=${domain}, attribute=${attribute}`);
        
        // increment sequence for next command
        this.sequence = (this.sequence + 1) % 127;

        this.client.write(frame);
    }
}
