// much of the raw algorithms used below is based on the foundational work done by
// https://github.com/chamberlain2007/aprilaire-ha
// without his exploration and ground work, it would have taken much longer to get this up and running

import net from 'node:net';
import { EventEmitter } from "events";
import { ThermostatAndIAQAvailableResponse, FreshAirSettingsResponse, AirCleaningSettingsResponse, DehumidificationSetpointResponse, HumidificationSetpointResponse, ThermostatSetpointAndModeSettingsResponse } from "./FunctionalDomainControl";
import { MacAddressResponse, ThermostatNameResponse, RevisionAndModelResponse, sanitizeIdentificationText } from "./FunctionalDomainIdentification";
import { ControllingSensorsStatusAndValueResponse, SensorValuesResponse, WrittenOutdoorTemperatureValueResponse } from "./FunctionalDomainSensors";
import { ThermostatInstallerSettingsResponse, ScaleResponse, DateAndTimeRequest, DateAndTimeResponse } from "./FunctionalDomainSetup";
import { CosRequest, CosResponse, IAQStatusResponse, ThermostatStatusResponse, SyncResponse, ThermostatErrorResponse, OfflineResponse } from "./FunctionalDomainStatus";
import { BasePayloadRequest } from "./BasePayloadRequest";
import { BasePayloadResponse, NackResponse } from "./BasePayloadResponse";
import { AwaySettingsResponse, HeatBlastResponse, ScheduleHoldResponse } from "./FunctionalDomainScheduling";
import { AlertsStatusResponse, ServiceRemindersStatusResponse } from './FunctionalDomainAlerts';
import { OutboundRequest, OutboundRequestQueue, PermanentNackEvent } from "./OutboundRequestQueue";
import { ConnectionSupervisor, ConnectionSupervisorOptions } from "./ConnectionSupervisor";

export class AprilaireClient extends EventEmitter {
    private client: AprilaireSocket;
    private supervisor: ConnectionSupervisor;
    private listenersWired: boolean = false;
    private ready: boolean = false;
    private dateTimeResyncTimer?: ReturnType<typeof setInterval>;

    /** Weekly clock rewrite (must be ≤ 2^31−1 ms so Node setInterval does not overflow). */
    static readonly DATE_TIME_RESYNC_MS = 7 * 24 * 60 * 60 * 1000;
    static readonly MAX_TIMER_DELAY_MS = 0x7fffffff;
    static readonly DEFAULT_NAME = "Thermostat";

    name: string;
    firmware: string;
    hardware: string;
    model: string;
    mac: string; 
    system: ThermostatAndIAQAvailableResponse;

    constructor(host: string, port: number, supervisorOptions: ConnectionSupervisorOptions = {}) {
        super();

        this.client = new AprilaireSocket(host, port);
        this.supervisor = new ConnectionSupervisor(
            {
                connect: () => this.client.connect(),
                drop: (reason) => this.client.dropConnection(reason),
                log: (message) => console.info(`[${this.client.host}:${this.client.port}] ${message}`),
            },
            supervisorOptions
        );
    }

    get host(): string {
        return this.client.host;
    }

    get port(): number {
        return this.client.port;
    }

    get connected(): boolean {
        return this.client.connected;
    }

    /** True once identification completed and `"ready"` has been emitted. */
    get isReady(): boolean {
        return this.ready;
    }

    /**
     * Queue a read. Unconfirmed commands survive unexpected disconnects and are
     * re-sent on the new socket. Intentional {@link disconnect} still drops them.
     */
    read(request: BasePayloadRequest): void {
        this.ensureSupervising();
        this.client.readObjectRequest(request);
    }

    write(request: BasePayloadRequest) {
        this.ensureSupervising();
        this.client.writeObjectRequest(request);
    }

    /**
     * Lazily start supervision so a command issued before an explicit connect()
     * still brings the link up — without tearing down an in-flight attempt.
     */
    private ensureSupervising(): void {
        if (!this.supervisor.isSupervising) {
            console.warn(`[${this.client.host}:${this.client.port}] command issued before connect; starting supervision`);
            this.connect();
        }
    }

    connect() {
        this.wireSocketListeners();
        this.supervisor.start();
    }

    private wireSocketListeners() {
        if (this.listenersWired)
            return;
        this.listenersWired = true;

        const self = this;

        this.client.on("connected", () => {
            self.supervisor.notifyConnected();
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Identification, FunctionalDomainIdentification.MacAddress);
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Identification, FunctionalDomainIdentification.RevisionAndModel);
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Identification, FunctionalDomainIdentification.ThermostatName);
            self.client.sendRequest(Action.ReadRequest, FunctionalDomain.Control, FunctionalDomainControl.ThermostatAndIAQAvailable);
            self.client.writeObjectRequest(new CosRequest());
            self.syncDateAndTime();
            self.startDateTimeResync();
            self.emit("connected", self);
        });
        this.client.on("disconnected", (reason?: string) => {
            self.stopDateTimeResync();
            self.supervisor.notifyDisconnected(reason);
            self.emit("disconnected", self, reason);
        });
        this.client.on("response", (response: BasePayloadResponse) => {
            this.clientResponse(response);
        });
        this.client.on("nack", (event: PermanentNackEvent) => {
            self.emit("nack", event, self);
        });
    }

    disconnect() {
        this.supervisor.stop();
        this.stopDateTimeResync();
        this.client.disconnect();
    }

    /** Write Setup/DateAndTime from the host's local wall clock. */
    syncDateAndTime(when: Date = new Date()): void {
        const request = DateAndTimeRequest.fromLocalDate(when);
        this.client.writeObjectRequest(request);
    }

    private startDateTimeResync(): void {
        this.stopDateTimeResync();
        const delayMs = Math.min(
            AprilaireClient.DATE_TIME_RESYNC_MS,
            AprilaireClient.MAX_TIMER_DELAY_MS
        );
        this.dateTimeResyncTimer = setInterval(() => {
            if (this.client.connected) {
                this.syncDateAndTime();
            }
        }, delayMs);
        // Do not keep the process alive solely for clock refresh.
        this.dateTimeResyncTimer.unref?.();
    }

    private stopDateTimeResync(): void {
        if (this.dateTimeResyncTimer) {
            clearInterval(this.dateTimeResyncTimer);
            this.dateTimeResyncTimer = undefined;
        }
    }

    private clientResponse(response: BasePayloadResponse) {
        if (response?.constructor?.name !== "BasePayloadResponse")
            console.info(`response received: ${response?.constructor?.name}`)

        if (response instanceof MacAddressResponse)
            this.mac = response.macAddress;

        else if (response instanceof ThermostatNameResponse) {
            const cleaned = sanitizeIdentificationText(response.name);
            if (cleaned)
                this.settleName(cleaned);
        }

        else if (response instanceof RevisionAndModelResponse) {
            this.firmware = `${response.firmwareMajor}.${response.firmwareMinor.toFixed(2)}`;
            this.hardware = response.hardware;
            this.model = response.model;
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse)
            this.system = response;

        this.tryEmitReady();
        this.emit("response", response, this);
    }

    private settleName(name: string): void {
        const next = name.trim() || AprilaireClient.DEFAULT_NAME;
        const prev = this.name;
        if (prev && prev !== AprilaireClient.DEFAULT_NAME && next === AprilaireClient.DEFAULT_NAME)
            return;

        this.name = next;
        if (this.ready && prev !== next)
            this.emit("name", this, prev);
    }

    requestThermostatName(): void {
        this.client.sendRequest(
            Action.ReadRequest,
            FunctionalDomain.Identification,
            FunctionalDomainIdentification.ThermostatName
        );
    }

    /** Ready once MAC, firmware, and IAQ availability are known. Name is optional. */
    private tryEmitReady(): void {
        if (this.ready)
            return;
        if (!this.mac || !this.firmware || !this.system)
            return;

        if (!this.name)
            this.name = AprilaireClient.DEFAULT_NAME;

        this.ready = true;
        this.emit("ready", this);
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
    ThermostatName = 5
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

export enum FunctionalDomainLockout {
    LockoutSettings = 1
}

export enum FunctionalDomainMessaging {
    PermanentMessages = 1,
    TemporaryMessage = 2
}

export enum FunctionalDomainDisplay {
    LcdBacklightSettings = 1
}

/**
 * Any attribute number in any functional domain. The numeric member keeps
 * domains that only have enums today (Lockout, Messaging, Display) usable by
 * request/response plumbing without widening every signature again.
 */
export type FunctionalDomainAttribute =
    | FunctionalDomainSetup
    | FunctionalDomainControl
    | FunctionalDomainScheduling
    | FunctionalDomainAlerts
    | FunctionalDomainSensors
    | FunctionalDomainLockout
    | FunctionalDomainStatus
    | FunctionalDomainIdentification
    | FunctionalDomainMessaging
    | FunctionalDomainDisplay
    | number;

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

/** Largest magnitude the 6 integer bits plus the half-degree bit can represent. */
export const MAX_ENCODABLE_TEMPERATURE_C = 63.5;

/** Encode °C: bit 7 sign, bit 6 half-degree, bits 5–0 magnitude. Clamp so values cannot wrap. */
export function convertTemperatureToByte(temperature: number): number {
    if (!Number.isFinite(temperature)) {
        console.warn(`temperature ${temperature} is not a finite number; encoding as Null`);
        return 0;
    }

    const isNegative = temperature < 0;
    let magnitude = Math.abs(temperature);

    if (magnitude > MAX_ENCODABLE_TEMPERATURE_C) {
        console.warn(
            `temperature ${temperature}C exceeds the encodable range; clamping magnitude to ${MAX_ENCODABLE_TEMPERATURE_C}C`
        );
        magnitude = MAX_ENCODABLE_TEMPERATURE_C;
    }

    const isFraction = magnitude % 1 >= 0.5;

    return Math.floor(magnitude)
        + (isFraction ? 64 : 0)
        + (isNegative ? 128 : 0);
}

/**
 * Decode protocol temperature byte to Celsius.
 */
export function convertByteToTemperature(byte: number): number {
    if (byte < 0 || byte > 255 || byte % 1 !== 0) {
        throw new Error(byte + " does not fit in a byte");
    }

    let value = byte & 63;

    // bit 6: half-degree
    if (Boolean(byte >> 6 & 1))
        value += 0.5;

    // bit 7: sign
    if (Boolean(byte >> 7 & 1))
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

/**
 * Aprilaire frame CRC (lookup-table). Used for both outbound frames and inbound validation.
 * Exported for unit tests that build wire-valid fixtures.
 */
export function generateCrc(data: Buffer): number {
    let crc = 0;
    for (let index = 0; index < data.length; index++) {
        const byte = data[index];
        const key = byte ^ crc;
        crc = crcMap.get(key);
    }
    return crc;
}

/**
 * One CRC-validated frame: REV SEQ CNT + payload + CRC.
 * NACK is Action+Status only (`domain` is None, `attribute` is the status code).
 */
export interface ReassembledFrame {
    revision: number;
    sequence: number;
    length: number;
    action: Action;
    domain: FunctionalDomain;
    attribute: number;
    payload: Buffer;
    crc: number;
}

/**
 * Candidate frames parsed in a single {@link reassembleFrames} pass. Bounded so a
 * corrupt length field cannot spin the parser, but high enough that a Status/Sync
 * COS dump (one frame per subscribed attribute) fits in one pass.
 */
export const MAX_FRAMES_PER_PASS = 256;

export interface FrameReassemblyResult {
    /** Complete frames with valid CRC only. */
    frames: ReassembledFrame[];
    /** Incomplete trailing bytes retained for the next append. */
    remainder: Buffer;
    /** Number of candidate frames dropped due to CRC mismatch. */
    crcFailures: number;
}

/** Parse complete frames from a sticky TCP buffer. Bad CRC drops that candidate by known CNT. */
export function reassembleFrames(buffer: Buffer, maxFrames: number = MAX_FRAMES_PER_PASS): FrameReassemblyResult {
    const frames: ReassembledFrame[] = [];
    let workingData = buffer;
    let crcFailures = 0;
    let count = 0;

    while (true) {
        if (workingData.length === 0 || count >= maxFrames)
            break;

        // Need at least REV+SEQ+CNT (4 bytes) to read length
        if (workingData.length < 4)
            break;

        const length = workingData.readUint16BE(2);
        const frameSize = 4 + length + 1;

        // Full frame not yet available — retain remainder for next TCP chunk
        if (workingData.length < frameSize)
            break;

        const candidate = workingData.subarray(0, frameSize);
        const body = candidate.subarray(0, 4 + length);
        const crc = candidate[4 + length];
        const crcCheck = generateCrc(body);

        if (crc !== crcCheck) {
            // Drop the bad frame's known span and continue with subsequent bytes.
            crcFailures++;
            workingData = workingData.subarray(frameSize);
            count++;
            continue;
        }

        const revision = workingData.readUint8(0);
        const sequence = workingData.readUint8(1);
        const action = workingData.readUint8(4) as Action;

        if (action === Action.NAck) {
            if (length < 2) {
                crcFailures++;
                workingData = workingData.subarray(frameSize);
                count++;
                continue;
            }
            const statusCode = workingData.readUint8(5);
            frames.push({
                revision,
                sequence,
                length,
                action,
                domain: FunctionalDomain.None,
                attribute: statusCode,
                payload: Buffer.from([statusCode]),
                crc,
            });
        } else {
            const domain = workingData.readUint8(5) as FunctionalDomain;
            const attribute = workingData.readUint8(6);
            // Data after the 7-byte header prefix (REV SEQ CNT ACTION DOMAIN ATTR)
            const payload = workingData.subarray(7, 4 + length);
            frames.push({
                revision,
                sequence,
                length,
                action,
                domain,
                attribute,
                payload,
                crc,
            });
        }

        workingData = workingData.subarray(frameSize);
        count++;
    }

    return {
        frames,
        remainder: workingData.length === 0 ? Buffer.alloc(0) : Buffer.from(workingData),
        crcFailures,
    };
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

        // NACK payload is Action + StatusCode only (no domain/attribute).
        // Frame parser stores status in attribute + a one-byte payload; fall back to domain
        // when constructed without a payload (status may be carried in either field).
        if (this.action === Action.NAck) {
            const statusCode = this.payload?.length
                ? this.payload.readUint8(0)
                : (this.attribute || Number(this.domain));
            console.warn(this.format(`NACK status=0x${statusCode.toString(16)} (${NAckError[statusCode] ?? "Unknown"}) sequence=${this.sequence}`));
            return new NackResponse(statusCode, this.sequence);
        }

        switch(this.domain) {
            case FunctionalDomain.Setup:
                switch(this.attribute) {
                    case FunctionalDomainSetup.ThermostatInstallSettings:
                        return new ThermostatInstallerSettingsResponse(this.payload);
                    case FunctionalDomainSetup.Scale:
                        return new ScaleResponse(this.payload);
                    case FunctionalDomainSetup.DateAndTime:
                        return new DateAndTimeResponse(this.payload);
                }
                break;
            case FunctionalDomain.Identification:
                switch(this.attribute) {
                    case FunctionalDomainIdentification.RevisionAndModel: 
                        return new RevisionAndModelResponse(this.payload);
                    case FunctionalDomainIdentification.MacAddress: 
                        return new MacAddressResponse(this.payload);
                    case FunctionalDomainIdentification.ThermostatName:
                        return new ThermostatNameResponse(this.payload, this.attribute);
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
                    case FunctionalDomainStatus.COS:
                        return new CosResponse(this.payload);
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

export enum ConnectionState {
    Disconnected = 0,
    Connecting = 1,
    Connected = 2,
}

/** TCP keepalive probe interval; surfaces dead peers the OS would otherwise hide. */
const KEEPALIVE_INITIAL_DELAY_MS = 30_000;

class AprilaireSocket extends EventEmitter {
    host: string;
    port: number;

    private client: net.Socket;
    private _state: ConnectionState = ConnectionState.Disconnected;
    /** Sticky TCP receive buffer: retains incomplete frame tails across `data` events. */
    private receiveBuffer: Buffer = Buffer.alloc(0);
    private outboundQueue: OutboundRequestQueue;

    get connected() : boolean {
        return this._state === ConnectionState.Connected;
    }

    get state(): ConnectionState {
        return this._state;
    }

    constructor(host: string, port: number) {
        super();

        this.host = host;
        this.port = port;

        this.outboundQueue = new OutboundRequestQueue(
            (sequence, request) => this.buildFrame(sequence, request),
            (frame) => {
                if (this.client)
                    this.client.write(frame);
            },
            undefined,
            {
                // Never hand a frame to a socket that is still connecting or already
                // destroyed: the write would be silently buffered and then discarded,
                // burning a sequence number for a command that never reaches the wire.
                canSend: () => this.connected && this.client !== undefined,
                onPermanentNack: (event) => {
                    console.warn(this.format(
                        `permanent NACK status=0x${event.statusCode.toString(16)} (${NAckError[event.statusCode] ?? "Unknown"}) sequence=${event.sequence} attempts=${event.attempts}`
                    ));
                    this.emit("nack", event);
                },
            }
        );
    }

    private format(message: string): string {
        return `[${new Date().toISOString()}] [${this.host}:${this.port}] ${message}`;
    }

    private setupSocket() {
        const self = this;

        // Replace any previous socket without announcing a disconnect: the caller
        // is starting a new attempt, not losing an established link.
        this.teardown(false, "replacing socket");

        const socket = new net.Socket();
        this.client = socket;

        socket.on("close", (hadError: boolean) => {
            console.debug(self.format(`close`), hadError);
            // Ignore close from a socket we already replaced.
            if (self.client !== socket)
                return;
            self.teardown(true, hadError ? "socket closed after error" : "socket closed");
        });

        socket.on("data", (data: Buffer) => {
            if (self.client !== socket)
                return;

            try {
                console.group(self.format(`received data, data=${data.toString("base64")}`));
                // Append to sticky buffer, then extract every complete frame.
                self.receiveBuffer = Buffer.concat([self.receiveBuffer, data]);
                self.drainReceiveBuffer();
            } finally {
                console.groupEnd();
            }
        });

        socket.on("ready", () => {
            console.debug(self.format(`ready`));
            if (self.client !== socket)
                return;

            self._state = ConnectionState.Connected;
            // Detect peers that vanish without a FIN (power loss, NAT eviction).
            socket.setKeepAlive(true, KEEPALIVE_INITIAL_DELAY_MS);
            socket.setNoDelay(true);
            self.emit('connected');
            // Anything queued while connecting can go out now.
            self.outboundQueue.flush();
        });

        socket.on("connect", () => { console.debug(self.format(`connect`)); });
        socket.on("drain", () => { console.debug(self.format(`drain`)); });
        socket.on("end", () => { console.debug(self.format(`end`)); });
        socket.on("error", (err: Error) => { console.debug(self.format(`error: ${err}`)); });
        socket.on("timeout", () => { console.debug(self.format(`timeout`)); });
    }

    /**
     * Parse every complete frame currently buffered.
     *
     * A single pass is bounded by {@link MAX_FRAMES_PER_PASS}, so keep going while
     * a pass fills its batch; a Sync dump can put more frames in one segment than
     * the cap allows and the surplus must not wait for the next `data` event.
     */
    private drainReceiveBuffer() {
        const self = this;

        while (true) {
            const { frames, remainder, crcFailures } = reassembleFrames(self.receiveBuffer);
            self.receiveBuffer = remainder;

            if (crcFailures > 0) {
                console.error(self.format(
                    `CRC failure: dropped ${crcFailures} frame(s); continuing with remainder length=${remainder.length}`
                ));
            }

            for (const frame of frames) {
                try {
                    if (frame.action === Action.NAck) {
                        console.debug(self.format(
                            `received NACK, sequence=${frame.sequence}, status=0x${frame.attribute.toString(16)}`
                        ));
                    } else {
                        console.debug(self.format(
                            `received data part, sequence=${frame.sequence}, action=${Action[frame.action]}, functional_domain=${FunctionalDomain[frame.domain]}, attribute=${frame.attribute}`
                        ));
                    }

                    const element = new AprilaireResponsePayload(
                        self.host,
                        self.port,
                        frame.revision,
                        frame.sequence,
                        frame.length,
                        frame.action,
                        frame.domain,
                        frame.attribute,
                        frame.payload,
                        frame.crc
                    );
                    const payload = element.toObject();

                    if (payload instanceof NackResponse) {
                        const seq = payload.sequence ?? element.sequence;
                        self.outboundQueue.handleNack(payload.statusCode, seq);
                    }

                    if (payload)
                        self.emit('response', payload);
                }
                catch (err) {
                    console.error(self.format(`failed to handle frame: ${err instanceof Error ? err.message : err}`));
                }
            }

            if (frames.length < MAX_FRAMES_PER_PASS)
                return;
        }
    }

    connect() {
        // Re-entrant connects used to destroy an in-flight socket and start over,
        // so two commands issued while down could thrash indefinitely.
        if (this._state !== ConnectionState.Disconnected) {
            console.debug(this.format(`connect ignored, state=${ConnectionState[this._state]}`));
            return;
        }

        this.setupSocket();
        this._state = ConnectionState.Connecting;
        this.client.connect({ port: this.port, host: this.host });
    }

    /** Intentional shutdown: drop queued commands; no reconnect announcement. */
    disconnect() {
        this.teardown(false, "closed by host", true);
    }

    /** Force the link down so supervision treats it as a failure and reconnects. */
    dropConnection(reason: string) {
        if (this._state === ConnectionState.Disconnected) {
            // Nothing to destroy, but the caller is still waiting on a retry.
            this.emit('disconnected', reason);
            return;
        }
        console.warn(this.format(`dropping connection: ${reason}`));
        this.teardown(true, reason, false);
    }

    /**
     * Release the current socket and reset per-connection state.
     *
     * Listeners are removed before destroy so the replaced socket cannot emit a
     * late `close` that would be mistaken for losing the new connection.
     *
     * Unexpected drops keep pending/in-flight user commands so they flush on the
     * next socket. Intentional disconnect (`dropQueue`) clears them.
     */
    private teardown(announce: boolean, reason: string, dropQueue: boolean = false) {
        const socket = this.client;

        this.client = undefined;
        this._state = ConnectionState.Disconnected;
        this.receiveBuffer = Buffer.alloc(0);
        if (dropQueue)
            this.outboundQueue.reset();
        else
            this.outboundQueue.requeueForReconnect();

        if (socket) {
            socket.removeAllListeners();
            socket.destroy();
        }

        if (announce)
            this.emit('disconnected', reason);
    }

    readObjectRequest(request: BasePayloadRequest) {
        this.sendCommand(Action.ReadRequest, request.domain, request.attribute, request.toBuffer());
    }

    writeObjectRequest(request: BasePayloadRequest) {
        const buffer = request.toBuffer();        
        this.sendCommand(Action.Write, request.domain, request.attribute, buffer);
    }

    sendRequest(action: Action, domain: FunctionalDomain, attribute: FunctionalDomainAttribute) {
        this.sendCommand(action, domain, attribute);
    }

    private sendCommand(action: Action, domain: FunctionalDomain, attribute: FunctionalDomainAttribute, data: Buffer = Buffer.alloc(0)) {
        const request: OutboundRequest = { action, domain, attribute, data };
        console.debug(this.format(
            `queuing data, action=${Action[action]}, functional_domain=${FunctionalDomain[domain]}, attribute=${attribute}, pending=${this.outboundQueue.pendingCount}`
        ));
        this.outboundQueue.enqueue(request);
    }

    /** Build a wire frame for the given sequence (used by OutboundRequestQueue; retries reuse the same frame). */
    private buildFrame(sequence: number, request: OutboundRequest): Buffer {
        const data = request.data ?? Buffer.alloc(0);
        const header = Buffer.alloc(7);
        header.writeUint8(1, 0); // protocol revision
        header.writeUint8(sequence, 1); // message counter sequence
        header.writeUint16BE(3 + data.byteLength, 2); // byte count of payload
        header.writeUint8(request.action, 4); // action
        header.writeUint8(request.domain, 5); // functional domain
        header.writeUint8(request.attribute, 6); // attribute being affected

        const payload = Buffer.concat([header, data], header.byteLength + data.byteLength);
        const payloadCrc = generateCrc(payload);

        const frame = Buffer.alloc(payload.byteLength + 1, payload);
        frame.writeUint8(payloadCrc, frame.byteLength - 1);

        console.debug(this.format(
            `sending data, sequence=${sequence}, action=${Action[request.action]}, functional_domain=${FunctionalDomain[request.domain]}, attribute=${request.attribute}, data=${frame.toString("base64")}`
        ));

        return frame;
    }
}
