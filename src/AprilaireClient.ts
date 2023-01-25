import { createCipheriv } from "crypto";
import EventEmitter from "events";
import { AprilaireSocket } from "./AprilaireSocket";
import { BasePayloadResponse } from "./Payloads/BasePayload";
import { SyncRequest } from "./Payloads/Sync";

export class AprilaireClient {
    client: AprilaireSocket;

    constructor(host: string, port: number) {
        this.client = new AprilaireSocket(host, port);
        this.client.responseReceived = this.clientResponseReceived;
        this.client.connected = this.clientConnected;
        this.client.disconnected = this.clientDisconnected
    }

    connect() {
        this.client.connect();
    }

    clientResponseReceived(response: BasePayloadResponse) {

    }

    clientConnected() {
        this.client.sendRequest(Action.ReadRequest, FunctionalDomain.Identification, FunctionalDomainIdentification.MacAddress);
        this.client.sendRequest(Action.ReadRequest, FunctionalDomain.Control, FunctionalDomainControl.ThermostatAndIAQAvailable);
        this.client.sendRequest(Action.ReadRequest, FunctionalDomain.Sensors, FunctionalDomainSensors.ControllingSensorValues);

        this.client.sendObjectRequest(Action.Write, new SyncRequest());
    }

    clientDisconnected() {

    }
}