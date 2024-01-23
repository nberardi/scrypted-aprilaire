// much of the raw algorithms used below is based on the foundational work done by
// https://github.com/chamberlain2007/aprilaire-ha
// without his exploration and ground work, it would have taken much longer to get this up and running

import net from 'node:net';
import { EventEmitter } from "events";
import { ThermostatAndIAQAvailableResponse, FreshAirSettingsResponse, AirCleaningSettingsResponse, DehumidificationSetpointResponse, HumidificationSetpointResponse, ThermostatSetpointAndModeSettingsResponse } from "./FunctionalDomainControl";
import { MacAddressResponse, ThermostatNameResponse, RevisionAndModelResponse } from "./FunctionalDomainIdentification";
import { ControllingSensorsStatusAndValueResponse, SensorValuesResponse, WrittenOutdoorTemperatureValueResponse } from "./FunctionalDomainSensors";
import { ThermostatInstallerSettingsResponse, ScaleResponse } from "./FunctionalDomainSetup";
import { CosRequest, IAQStatusResponse, ThermostatStatusResponse, SyncResponse, ThermostatErrorResponse, OfflineResponse } from "./FunctionalDomainStatus";
import { BasePayloadRequest } from "./BasePayloadRequest";
import { BasePayloadResponse } from "./BasePayloadResponse";
import { AwaySettingsResponse, HeatBlastResponse, ScheduleHoldResponse } from "./FunctionalDomainScheduling";
import { AlertsStatusResponse, ServiceRemindersStatusResponse } from './FunctionalDomainAlerts';

export class AprilaireClient extends EventEmitter {
    private client: AprilaireSocket;
    private ready: boolean = false;

    name: string;
    firmware: string;
    hardware: string;
    model: string;
    mac: string; 
    system: ThermostatAndIAQAvailableResponse;

    constructor(host: string, port: number) {
        super();

        this.client = new AprilaireSocket(host, port);
    }

    read(request: BasePayloadRequest): void {
        if (!this.client.connected) {
            console.warn("socket not connected, re-establishing connection");
            this.connect();
        }

        this.client.readObjectRequest(request);
    }

    write(request: BasePayloadRequest) {
        if (!this.client.connected) {
            console.warn("socket not connected, re-establishing connection");
            this.connect();
        }

        this.client.writeObjectRequest(request);
    }

    connect() {
        const self = this;

        this.client.removeAllListeners();
        this.client.once("connected", () => {
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Identification, FunctionalDomainIdentification.MacAddress);
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Identification, FunctionalDomainIdentification.RevisionAndModel);
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Identification, FunctionalDomainIdentification.ThermostatName);
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Control, FunctionalDomainControl.ThermostatAndIAQAvailable);
            self.client.writeObjectRequest(new CosRequest());
    
            self.emit("connected", self);
        });
        this.client.once("disconnected", (err?: Error) => {
            self.emit("disconnected", self, err);
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
            this.firmware = `${response.firmwareMajor}.${response.firmwareMinor.toFixed(2)}`;
            this.hardware = response.hardware;
            this.model = response.model;
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse)
            this.system = response;

        if (!this.ready && this.mac && this.firmware && this.system && this.name) {
            this.ready = true;
            this.emit("ready", this);
        }

        this.emit("response", response, this);
    }
}

export enum Action {
    None = 0,
    Write = 1,
    ReadRequest = 2,
    ReadResponse = 3,
    COS = 5,
    NAck = 6
}

export enum FunctionalDomain {
    None = 0,
    Setup = 1,
    Control = 2,
    Scheduling = 3,
    Alerts = 4,
    Sensors = 5,
    Lockout = 6,
    Status = 7,
    Identification = 8,
    Messaging = 9,
    Display = 10,
    Weather = 13,
    FirmwareUpdate = 14,
    DebugCommands = 15,
    NAck = 16
}

export enum FunctionalDomainSetup {
    ThermostatInstallSettings = 1,
    ContractorInformation = 2,
    Scale = 3,
    DateAndTime = 4,
    AirCleaningInstallerSettings = 5,
    HumidityControlInstallerSettings = 6,
    FreshAirInstallerSettings = 7,
    ResetPowerCycle = 8
}

export enum FunctionalDomainIdentification {
    RevisionAndModel = 1,
    MacAddress = 2,
    ThermostatName = 4
}

export enum FunctionalDomainAlerts {
    ServiceRemindersStatus = 1,
    AlertsStatus = 2,
    AlertsSettings = 3
}

export enum FunctionalDomainScheduling {
    ScheduleSettings = 1,
    AwaySettings = 2,
    ScheduleDay = 3,
    ScheduleHold = 4,
    HeatBlast = 5
}

export enum FunctionalDomainControl {
    ThermstateSetpointAndModeSettings = 1,
    IncrementSetpoint = 2,
    DehumidificationSetpoint = 3,
    HumidificationSetpoint = 4,
    FreshAirSetting = 5,
    AirCleaningSetting = 6,
    ThermostatAndIAQAvailable = 7
} 

export enum FunctionalDomainStatus {
    COS = 1,
    Sync = 2,
    Offline = 5,
    ThermostatStatus = 6,
    IAQStatus = 7,
    ThermostatError = 8
}

export enum FunctionalDomainSensors {
    SensorValues = 1,
    ControllingSensorValues = 2,
    SupportModules = 3,
    WrittenOutdoorTemperatureValue = 4
}

export enum NAckError {
    GenericError = 0x1,
    BufferFullOrDeviceBusy = 0x3,
    UnsupportedProtocolRevision = 0x4,
    UnknownAction = 0x5,
    UnknownFunctionalDomain = 0x6,
    UnknownAttribute = 0x7,
    ThermostateCannotAcceptWrites = 0x8,
    TimedOutWaitingForResponse = 0x9,
    UnsupportedModel = 0xA,
    WriteValueOutOfRange = 0x10,
    WriteAttributeReadOnly = 0x11,
    WriteAttributeNotWritableInCurrentConfig = 0x12,
    WriteIncorrectPayloadSize = 0x13,
    ReadAttributeNotReadable = 0x20,
    ReadAttributeNotAvailable = 0x21,
    ReadIncorrectPayloadSize = 0x22
}

export function convertTemperatureToByte(temperature: number): number {
    // LOG bits ("000000000" + byte.toString(2)).substring(-8);
    let isNegative = temperature < 0;
    let isFraction = temperature % 1 >= 0.5;

    let byte = Math.floor(temperature)
        + (isFraction ? 64 : 0)
        + (isNegative ? 128 : 0);

    return byte;
}

export function convertByteToTemperature(byte: number): number {
    if (byte < 0 || byte > 255 || byte % 1 !== 0) {
        throw new Error(byte + " does not fit in a byte");
    }
    // LOG bits ("000000000" + byte.toString(2)).substring(-8);
    let value = byte & 63;

    // has fraction
    if (Boolean(byte >> 6 & 1))
        value += 0.5;

    // is negative
    if (byte >> 1 === 1)
        value = -value;

    return value;
}

const crcMap = new Map<number,number>([
    [0, 0],
    [1, 49],
    [2, 98],
    [3, 83],
    [4, 196],
    [5, 245],
    [6, 166],
    [7, 151],
    [8, 185],
    [9, 136],
    [10, 219],
    [11, 234],
    [12, 125],
    [13, 76],
    [14, 31],
    [15, 46],
    [16, 67],
    [17, 114],
    [18, 33],
    [19, 16],
    [20, 135],
    [21, 182],
    [22, 229],
    [23, 212],
    [24, 250],
    [25, 203],
    [26, 152],
    [27, 169],
    [28, 62],
    [29, 15],
    [30, 92],
    [31, 109],
    [32, 134],
    [33, 183],
    [34, 228],
    [35, 213],
    [36, 66],
    [37, 115],
    [38, 32],
    [39, 17],
    [40, 63],
    [41, 14],
    [42, 93],
    [43, 108],
    [44, 251],
    [45, 202],
    [46, 153],
    [47, 168],
    [48, 197],
    [49, 244],
    [50, 167],
    [51, 150],
    [52, 1],
    [53, 48],
    [54, 99],
    [55, 82],
    [56, 124],
    [57, 77],
    [58, 30],
    [59, 47],
    [60, 184],
    [61, 137],
    [62, 218],
    [63, 235],
    [64, 61],
    [65, 12],
    [66, 95],
    [67, 110],
    [68, 249],
    [69, 200],
    [70, 155],
    [71, 170],
    [72, 132],
    [73, 181],
    [74, 230],
    [75, 215],
    [76, 64],
    [77, 113],
    [78, 34],
    [79, 19],
    [80, 126],
    [81, 79],
    [82, 28],
    [83, 45],
    [84, 186],
    [85, 139],
    [86, 216],
    [87, 233],
    [88, 199],
    [89, 246],
    [90, 165],
    [91, 148],
    [92, 3],
    [93, 50],
    [94, 97],
    [95, 80],
    [96, 187],
    [97, 138],
    [98, 217],
    [99, 232],
    [100, 127],
    [101, 78],
    [102, 29],
    [103, 44],
    [104, 2],
    [105, 51],
    [106, 96],
    [107, 81],
    [108, 198],
    [109, 247],
    [110, 164],
    [111, 149],
    [112, 248],
    [113, 201],
    [114, 154],
    [115, 171],
    [116, 60],
    [117, 13],
    [118, 94],
    [119, 111],
    [120, 65],
    [121, 112],
    [122, 35],
    [123, 18],
    [124, 133],
    [125, 180],
    [126, 231],
    [127, 214],
    [128, 122],
    [129, 75],
    [130, 24],
    [131, 41],
    [132, 190],
    [133, 143],
    [134, 220],
    [135, 237],
    [136, 195],
    [137, 242],
    [138, 161],
    [139, 144],
    [140, 7],
    [141, 54],
    [142, 101],
    [143, 84],
    [144, 57],
    [145, 8],
    [146, 91],
    [147, 106],
    [148, 253],
    [149, 204],
    [150, 159],
    [151, 174],
    [152, 128],
    [153, 177],
    [154, 226],
    [155, 211],
    [156, 68],
    [157, 117],
    [158, 38],
    [159, 23],
    [160, 252],
    [161, 205],
    [162, 158],
    [163, 175],
    [164, 56],
    [165, 9],
    [166, 90],
    [167, 107],
    [168, 69],
    [169, 116],
    [170, 39],
    [171, 22],
    [172, 129],
    [173, 176],
    [174, 227],
    [175, 210],
    [176, 191],
    [177, 142],
    [178, 221],
    [179, 236],
    [180, 123],
    [181, 74],
    [182, 25],
    [183, 40],
    [184, 6],
    [185, 55],
    [186, 100],
    [187, 85],
    [188, 194],
    [189, 243],
    [190, 160],
    [191, 145],
    [192, 71],
    [193, 118],
    [194, 37],
    [195, 20],
    [196, 131],
    [197, 178],
    [198, 225],
    [199, 208],
    [200, 254],
    [201, 207],
    [202, 156],
    [203, 173],
    [204, 58],
    [205, 11],
    [206, 88],
    [207, 105],
    [208, 4],
    [209, 53],
    [210, 102],
    [211, 87],
    [212, 192],
    [213, 241],
    [214, 162],
    [215, 147],
    [216, 189],
    [217, 140],
    [218, 223],
    [219, 238],
    [220, 121],
    [221, 72],
    [222, 27],
    [223, 42],
    [224, 193],
    [225, 240],
    [226, 163],
    [227, 146],
    [228, 5],
    [229, 52],
    [230, 103],
    [231, 86],
    [232, 120],
    [233, 73],
    [234, 26],
    [235, 43],
    [236, 188],
    [237, 141],
    [238, 222],
    [239, 239],
    [240, 130],
    [241, 179],
    [242, 224],
    [243, 209],
    [244, 70],
    [245, 119],
    [246, 36],
    [247, 21],
    [248, 59],
    [249, 10],
    [250, 89],
    [251, 104],
    [252, 255],
    [253, 206],
    [254, 157],
    [255, 172]
]);

function generateCrc(data: Buffer): number {
    let crc = 0;
    for (let index = 0; index < data.length; index++) {
        const byte = data[index];
        const key = byte ^ crc;
        crc = crcMap.get(key);
    }
    return crc;
}

export class AprilaireResponsePayload {
    host: string;
    port: number;
    revision: number;
    sequence: number;
    length: number;
    action: Action;
    domain: FunctionalDomain;
    attribute: number;
    payload: Buffer;
    crc: number;

    constructor(host: string, port: number, revision: number, sequence: number, length: number, action: Action, domain: FunctionalDomain, attribute: number, payload: Buffer, crc: number) {
        this.host = host;
        this.port = port;
        this.revision = revision;
        this.sequence = sequence;
        this.length = length;
        this.action = action;
        this.domain = domain;
        this.attribute = attribute;
        this.payload = payload;
        this.crc = crc;
    }

    private format(message: string): string {
        return `[${new Date().toISOString()}] [${this.host}:${this.port}] ${message}`;
    }

    toObject(): BasePayloadResponse | undefined {
        if (this.action === Action.Write || this.action === Action.ReadRequest || this.action === Action.None) {
            console.warn(this.format(`skipping, action=${Action[this.action]}, functional_domain=${FunctionalDomain[this.domain]}, attribute=${this.attribute}}`));
            return undefined;
        }

        if (this.action === Action.NAck) {
            throw Error(`[${this.host}:${this.port}] received error, action=${Action[this.action]}, functional_domain=${FunctionalDomain[this.domain]}, attribute=${this.attribute}}`);
        }

        switch(this.domain) {
            case FunctionalDomain.Setup:
                switch(this.attribute) {
                    case FunctionalDomainSetup.ThermostatInstallSettings:
                        return new ThermostatInstallerSettingsResponse(this.payload);
                    case FunctionalDomainSetup.Scale:
                        return new ScaleResponse(this.payload);
                }
                break;
            case FunctionalDomain.Identification:
                switch(this.attribute) {
                    case FunctionalDomainIdentification.RevisionAndModel: 
                        return new RevisionAndModelResponse(this.payload);
                    case FunctionalDomainIdentification.MacAddress: 
                        return new MacAddressResponse(this.payload);
                    case FunctionalDomainIdentification.ThermostatName:
                        return new ThermostatNameResponse(this.payload);
                }
                break;
            case FunctionalDomain.Scheduling:
                switch(this.attribute) {
                    case FunctionalDomainScheduling.ScheduleHold:
                        return new ScheduleHoldResponse(this.payload);
                    case FunctionalDomainScheduling.HeatBlast:
                        return new HeatBlastResponse(this.payload);
                    case FunctionalDomainScheduling.AwaySettings:
                        return new AwaySettingsResponse(this.payload);
                }
                break;
            case FunctionalDomain.Alerts:
                switch(this.attribute) {
                    case FunctionalDomainAlerts.ServiceRemindersStatus:
                        return new ServiceRemindersStatusResponse(this.payload);
                    case FunctionalDomainAlerts.AlertsStatus: 
                        return new AlertsStatusResponse(this.payload);
                }
                break;
            case FunctionalDomain.Control:
                switch(this.attribute) {
                    case FunctionalDomainControl.FreshAirSetting:
                        return new FreshAirSettingsResponse(this.payload);
                    case FunctionalDomainControl.AirCleaningSetting:
                        return new AirCleaningSettingsResponse(this.payload);
                    case FunctionalDomainControl.DehumidificationSetpoint:
                        return new DehumidificationSetpointResponse(this.payload);
                    case FunctionalDomainControl.HumidificationSetpoint:
                        return new HumidificationSetpointResponse(this.payload);
                    case FunctionalDomainControl.ThermstateSetpointAndModeSettings:
                        return new ThermostatSetpointAndModeSettingsResponse(this.payload);
                    case FunctionalDomainControl.ThermostatAndIAQAvailable:
                        return new ThermostatAndIAQAvailableResponse(this.payload);
                }
                break;
            case FunctionalDomain.Status: 
                switch(this.attribute) {
                    case FunctionalDomainStatus.IAQStatus:
                        return new IAQStatusResponse(this.payload);
                    case FunctionalDomainStatus.ThermostatStatus:
                        return new ThermostatStatusResponse(this.payload);
                    case FunctionalDomainStatus.Sync:
                        return new SyncResponse(this.payload);
                    case FunctionalDomainStatus.ThermostatError:
                        return new ThermostatErrorResponse(this.payload);
                    case FunctionalDomainStatus.Offline:
                        return new OfflineResponse(this.payload);
                }
                break;
            case FunctionalDomain.Sensors:
                switch(this.attribute) {
                    case FunctionalDomainSensors.SensorValues:
                        return new SensorValuesResponse(this.payload);
                    case FunctionalDomainSensors.ControllingSensorValues:
                        return new ControllingSensorsStatusAndValueResponse(this.payload);
                    case FunctionalDomainSensors.WrittenOutdoorTemperatureValue:
                        return new WrittenOutdoorTemperatureValueResponse(this.payload);
                }
                break;
        }

        console.warn(this.format(`not implimented response payload, action=${Action[this.action]}, functional_domain=${FunctionalDomain[this.domain]}, attribute=${this.attribute}}`));
        return new BasePayloadResponse(this.payload, this.domain, this.attribute);
    }
}

class AprilaireSocket extends EventEmitter {
    host: string;
    port: number;
    
    private client: net.Socket;
    private sequence: number = 0;
    private _connected: boolean = true;

    get connected() : boolean {
        return this._connected;
    }

    constructor(host: string, port: number) {
        super();

        this.host = host;
        this.port = port;
    }

    private format(message: string): string {
        return `[${new Date().toISOString()}] [${this.host}:${this.port}] ${message}`;
    }

    private setupSocket() {
        const self = this;

        if (this.client)
            this.disconnect();

        this._connected = false;
        this.client = new net.Socket();

        this.client.on("close", (hadError: boolean) => {
            console.debug(self.format(`close`), hadError);

            self._connected = false;
            self.emit('disconnected');
        });

        this.client.on("data", (data: Buffer) => {
            try {
                console.group(self.format(`received data, data=${data.toString("base64")}`));
                self.parseResponse(data).forEach(element => {
                    try {
                        const payload = element.toObject();

                        if (payload)
                            self.emit('response', payload);
                    }
                    catch (err) {
                        console.error(err.message);
                    }
                });
            } finally {
                console.groupEnd();
            }
        });

        this.client.on("ready", () => { 
            console.debug(self.format(`ready`));

            self._connected = true;
            self.emit('connected');
        });

        this.client.on("connect", () => { console.debug(self.format(`connect`)); });
        this.client.on("drain", () => { console.debug(self.format(`drain`)); });
        this.client.on("end", () => { console.debug(self.format(`end`)); });
        this.client.on("error", (err: Error) => { console.debug(self.format(`error: ${err}`)); });
        this.client.on("timeout", () => { console.debug(self.format(`timeout`)); });
    }

    connect() {
        this.setupSocket();
        this.client.connect({ port: this.port, host: this.host });
    }

    disconnect() {
        this.client.destroy();
        this.client = undefined;
    }

    readObjectRequest(request: BasePayloadRequest) { 
        this.sendCommand(Action.ReadRequest, request.domain, request.attribute);
    }

    writeObjectRequest(request: BasePayloadRequest) {
        const buffer = request.toBuffer();        
        this.sendCommand(Action.Write, request.domain, request.attribute, buffer);
    }

    sendRequest(action: Action, domain: FunctionalDomain, attribute: FunctionalDomainControl | FunctionalDomainIdentification | FunctionalDomainScheduling | FunctionalDomainSensors | FunctionalDomainStatus | FunctionalDomainSetup) {
        this.sendCommand(action, domain, attribute);
    }

    private parseResponse (data: Buffer) : AprilaireResponsePayload[] {
        let response: AprilaireResponsePayload[] = [];
    
        let workingData = data;
        let count = 0;
        let position = 0;
        while(true) {
            if (workingData.length === 0 || count > 50)
                break;
        
            const { revision, sequence, length, action, domain, attribute } = this.decodeHeader(workingData);
            const payload = workingData.subarray(7, 4 + length);
            const crc = workingData[4 + length];
            const crcCheck = generateCrc(workingData.subarray(0, 4 + length));
    
            console.assert(crc === crcCheck, `failed: crc check, expecting ${crcCheck} received ${crc}`);
            console.debug(this.format(`received data part, position=${position}, sequence=${sequence}, action=${Action[action]}, functional_domain=${FunctionalDomain[domain]}, attribute=${attribute}, data=${workingData.toString("base64")}`));
        
            response.push(new AprilaireResponsePayload(this.host, this.port, revision, sequence, length, action, domain, attribute, payload, crc));
    
            const nextStart = 4 + length + 1;
            workingData = workingData.subarray(nextStart);
        
            position = position + nextStart;
            count++;
        }
    
        return response;
    }
    
    private decodeHeader (data: Buffer) {
        try {
            const revision: number = data.readUint8(0);
            const sequence: number = data.readUint8(1);
            const length: number = data.readUint16BE(2);
            const action: Action = data.readUint8(4);
            const domain: FunctionalDomain = data.readUint8(5);
            const attribute: number = data.readUint8(6);
            return { revision, sequence, length, action, domain, attribute };
        } catch {
            return { revision: 1, sequence: 0, length: 0, action: Action.None, domain: FunctionalDomain.None, attribute: 0 };
        }
    }

    private sendCommand(action: Action, domain: FunctionalDomain, attribute: FunctionalDomainControl | FunctionalDomainIdentification | FunctionalDomainScheduling | FunctionalDomainSensors | FunctionalDomainStatus | FunctionalDomainSetup, data: Buffer = Buffer.alloc(0)) {
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

        console.debug(this.format(`queuing data, sequence=${this.sequence}, action=${Action[action]}, functional_domain=${FunctionalDomain[domain]}, attribute=${attribute}, data=${frame.toString("base64")}`));

        // increment sequence for next command
        this.sequence = (this.sequence + 1) % 127;
        
        this.client.write(frame);
    }
}
