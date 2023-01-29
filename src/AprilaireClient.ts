import { EventEmitter } from "events";
import { Action, FunctionalDomain, FunctionalDomainControl, FunctionalDomainIdentification, FunctionalDomainSensors, generateCrc } from "./Constants";
import { Socket } from "node:net";
import { parseResponse } from "./payloads/AprilaireResponsePayload";
import { BasePayloadRequest, BasePayloadResponse } from "./payloads/BasePayload";
import { ThermostatAndIAQAvailableResponse } from "./payloads/FunctionalDomainControl";
import { MacAddressResponse, ThermostatNameResponse, RevisionAndModelResponse } from "./payloads/FunctionalDomainIdentification";
import { ControllingSensorsStatusAndValueResponse } from "./payloads/FunctionalDomainSensors";
import { CosRequest, SyncRequest } from "./payloads/FunctionalDomainStatus";

export class AprilaireClient extends EventEmitter {
    private client: AprilaireSocket;
    private ready: boolean = false;

    name: string;
    firmware: string;
    hardware: string;
    model: string;
    mac: string; 
    system: ThermostatAndIAQAvailableResponse;
    sensors: ControllingSensorsStatusAndValueResponse;

    constructor(host: string, port: number) {
        super();

        this.client = new AprilaireSocket(host, port);
    }

    requestThermostatIAQAvailable() {
        this.client.sendRequest(Action.ReadRequest, FunctionalDomain.Control, FunctionalDomainControl.ThermostatAndIAQAvailable);
    }

    requestThermostatSetpointAndModeSettings() {
        this.client.sendRequest(Action.ReadRequest, FunctionalDomain.Control, FunctionalDomainControl.ThermstateSetpointAndModeSettings);
    }

    write(request: BasePayloadRequest) {
        this.client.sendObjectRequest(Action.Write, request);
    }

    connect() {
        const self = this;

        this.client.removeAllListeners();
        this.client.once("connected", () => {
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Identification, FunctionalDomainIdentification.MacAddress);
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Identification, FunctionalDomainIdentification.RevisionAndModel);
            //self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Identification, FunctionalDomainIdentification.ThermostatName);
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Control, FunctionalDomainControl.ThermostatAndIAQAvailable);
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Sensors, FunctionalDomainSensors.ControllingSensorValues);
            self.client.sendObjectRequest(Action.Write, new CosRequest());
            self.client.sendObjectRequest(Action.Write, new SyncRequest());
    
            self.emit("connected", self);
        });
        this.client.once("disconnected", () => {
            self.emit("disconnected", self);
        });
        this.client.on("response", (response: BasePayloadResponse) => {
            this.clientResponse(response);
        });

        this.client.connect();
    }

    disconnect() {
        this.client.disconnect();
    }

    private clientResponse(response: BasePayloadResponse) {
        if (response?.constructor?.name !== "BasePayloadResponse")
            console.info(`response received: ${response?.constructor?.name}`)

        if (response instanceof MacAddressResponse)
            this.mac = response.macAddress;

        else if (response instanceof ThermostatNameResponse)
            this.name = response.name;

        else if (response instanceof RevisionAndModelResponse) {
            this.firmware = `${response.firmwareMajor}.${response.firmwareMinor}`;
            this.hardware = response.hardware;
            this.model = response.model;
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse)
            this.system = response;

        else if (response instanceof ControllingSensorsStatusAndValueResponse)
            this.sensors = response;

        if (!this.ready && this.mac && this.firmware && this.system && this.sensors && this.name) {
            this.ready = true;
            this.emit("ready", this);
        }

        this.emit("response", response, this);
    }
}

class AprilaireSocket extends EventEmitter {
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
            console.debug(`socket data: ${data.toString("base64")}`);

            parseResponse(data).forEach(element => {
                const payload = element.toObject();
                self.emit('response', payload);
            });
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
        const payloadCrc = generateCrc(payload);

        const frame = Buffer.alloc(payload.byteLength + 1, payload);
        frame.writeUint8(payloadCrc, frame.byteLength - 1);

        console.debug(`Queuing data, sequence=${this.sequence}, action=${action}, functional_domain=${domain}, attribute=${attribute}`);
        
        // increment sequence for next command
        this.sequence = (this.sequence + 1) % 127;

        this.client.write(frame);
    }
}
