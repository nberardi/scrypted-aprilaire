import { FunctionalDomain, FunctionalDomainIdentification } from "./AprilaireClient";
import { BasePayloadRequest } from "./BasePayloadRequest";
import { BasePayloadResponse, readPayloadU8 } from "./BasePayloadResponse";

/*
*
* Functional Domain: Identification
* Byte: 0x08
*
* Attribute                 |   Byte    |   COS |   R/W |   Implimented
* --------------------------|-----------|-------|-------|---------------
* Revision & Model          |   0x01    |   Yes |   R   |   X
* MAC Address               |   0x02    |   No  |   R   |   X
* Thermostat Name           |   0x05    |   No  |   R/W |   X
*
*/

export class ThermostatNameResponse extends BasePayloadResponse {
    postalCode: string;
    name: string;
    constructor(payload: Buffer, attribute: number = FunctionalDomainIdentification.ThermostatName) {
        super(payload, FunctionalDomain.Identification, attribute);

        const postalCodeBytes = payload.subarray(0, 7);
        const nameBytes = payload.length >= 8
            ? payload.subarray(8, Math.min(payload.length, 8 + 15))
            : Buffer.alloc(0);

        // Protocol pads with NUL; strip all nulls and control bytes for a clean label.
        this.postalCode = sanitizeIdentificationText(postalCodeBytes);
        this.name = sanitizeIdentificationText(nameBytes);
    }
}

/** Postal field: 7 chars + NUL. Name field: 15 chars + NUL. */
export const THERMOSTAT_NAME_POSTAL_WIDTH = 7;
export const THERMOSTAT_NAME_WIDTH = 15;

function encodeFixedAsciiField(text: string, width: number): Buffer {
    const field = Buffer.alloc(width + 1); // width chars + terminating NUL
    Buffer.from(text ?? "", "ascii").copy(field, 0, 0, width);
    return field;
}

/**
 * Write Identification / Thermostat Name (§8.5) — 24 data bytes.
 * Attribute is 0x05. Guide marks this as 8840-class only.
 */
export class ThermostatNameRequest extends BasePayloadRequest {
    postalCode: string = "";
    name: string = "";

    constructor() {
        super(FunctionalDomain.Identification, FunctionalDomainIdentification.ThermostatName);
    }

    toBuffer(): Buffer {
        return Buffer.concat([
            encodeFixedAsciiField(this.postalCode, THERMOSTAT_NAME_POSTAL_WIDTH),
            encodeFixedAsciiField(this.name, THERMOSTAT_NAME_WIDTH),
        ]);
    }
}

/** ASCII identification strings are fixed-width and NUL-padded on the wire. */
export function sanitizeIdentificationText(bytes: Buffer | string): string {
    const raw = typeof bytes === "string" ? bytes : bytes.toString("ascii");
    return raw.replace(/\0/g, "").replace(/[\x00-\x1f\x7f]/g, "").trim();
}

export class MacAddressResponse extends BasePayloadResponse {
    macAddress: string;
    forceConnection: ForceConnectionType;
    setting: HVACAutomationSetting;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Identification, FunctionalDomainIdentification.MacAddress);

        const macAddressBytes = payload.subarray(0, Math.min(6, payload.length));
        this.macAddress = macAddressBytes.toString("hex");

        this.forceConnection = readPayloadU8(payload, 6);
        this.setting = readPayloadU8(payload, 7);
    }
}

export enum ForceConnectionType {
    NoAlertsOrReminders = 0,
    AlertsAndReminders = 1,
    WeatherUpdateRequired = 2
}

export enum HVACAutomationSetting {
    HVAC = 0,
    Automation = 1
}

export class RevisionAndModelResponse extends BasePayloadResponse {
    hardware: string;
    firmwareMajor: number;
    firmwareMinor: number;
    protocolMajor: number;
    model: string;
    gainspanFirmwareMajor: number;
    gainspanFirmwareMinor: number;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Identification, FunctionalDomainIdentification.RevisionAndModel);

        this.hardware = String.fromCharCode(readPayloadU8(payload, 0));
        this.firmwareMajor = readPayloadU8(payload, 1);
        this.firmwareMinor = readPayloadU8(payload, 2);
        this.protocolMajor = readPayloadU8(payload, 3);
        this.model = this.convertByteToModel(readPayloadU8(payload, 4));
        this.gainspanFirmwareMajor = readPayloadU8(payload, 5);
        this.gainspanFirmwareMinor = readPayloadU8(payload, 6);
    }

    convertByteToModel(byte: number): string {
        switch(byte) {
            case 0: return "8476W";
            case 1: return "8810";
            case 2: return "8620W";
            case 3: return "8820";
            case 4: return "8910W";
            case 5: return "8830";
            case 6: return "8920W";
            case 7: return "8840";
            case 14: return "8840M";
            case 28: return "6003";
            default: return `Unknown (${byte})`;
        }
    }
}