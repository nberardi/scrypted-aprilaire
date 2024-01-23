import { FunctionalDomain, FunctionalDomainIdentification } from "./AprilaireClient";
import { BasePayloadResponse } from "./BasePayloadResponse";

/*
*
* Functional Domain: Identification
* Byte: 0x08
*
* Attribute                 |   Byte    |   COS |   R/W |   Implimented
* --------------------------|-----------|-------|-------|---------------
* Revision & Model          |   0x01    |   Yes |   R   |   X
* MAC Address               |   0x02    |   No  |   R   |   X
* Thermostat Name           |   0x03    |   No  |   R/W |   X
*
*/

export class ThermostatNameResponse extends BasePayloadResponse {
    postalCode: string;
    name: string;
    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Identification, FunctionalDomainIdentification.ThermostatName);

        const postalCodeBytes = payload.subarray(0, 7);
        const nameBytes = payload.subarray(8, 8 + 15);

        this.postalCode = postalCodeBytes.toString("ascii");
        this.name = nameBytes.toString("ascii");
    }
}

export class MacAddressResponse extends BasePayloadResponse {
    macAddress: string;
    forceConnection: ForceConnectionType;
    setting: HVACAutomationSetting;

    constructor(payload: Buffer) {
        super(payload, FunctionalDomain.Identification, FunctionalDomainIdentification.MacAddress);

        const macAddressBytes = payload.subarray(0, 6);
        this.macAddress = macAddressBytes.toString("hex");

        this.forceConnection = payload.readUint8(6);
        this.setting = payload.readUint8(7);
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

        this.hardware = String.fromCharCode(payload.readUint8(0));
        this.firmwareMajor = payload.readUint8(1);
        this.firmwareMinor = payload.readUint8(2);
        this.protocolMajor = payload.readUint8(3);
        this.model = this.convertByteToModel(payload.readUint8(4));
        this.gainspanFirmwareMajor = payload.readUint8(5);
        this.gainspanFirmwareMinor = payload.readUint8(6);
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
        }
    }
}