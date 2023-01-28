import { EventEmitter } from "events";
import { AprilaireSocket } from "./AprilaireSocket";
import { SyncRequest, CosRequest, BasePayloadResponse, MacAddressResponse, ThermostatNameResponse, RevisionAndModelResponse, ThermostatAndIAQAvailableResponse, ControllingSensorsStatusAndValueResponse, BasePayloadRequest } from "./payloads";
import { Action, FunctionalDomain, FunctionalDomainControl, FunctionalDomainIdentification, FunctionalDomainSensors } from "./Constants";

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