import { BasePayloadRequest } from ".";
import { FunctionalDomain, FunctionalDomainStatus } from "../Constants";

export class CosRequest extends BasePayloadRequest {
    constructor() {
        super(FunctionalDomain.Status, FunctionalDomainStatus.COS);
    }

    toBuffer(): Buffer {
        const payload = Buffer.from(new Uint8Array([
            1,  // Installer Thermostat Settings
            0,  // Contractor Information
            0,  // Air Cleaning Installer Variable
            0,  // Humidity Control Installer Settings
            0,  // Fresh Air Installer Settings
            1,  // Thermostat Setpoint & Mode Settings
            1,  // Dehumidification Setpoint
            1,  // Humidification Setpoint
            1,  // Fresh Air Setting
            1,  // Air Cleaning Settings
            1,  // Thermostat IAQ Available
            0,  // Schedule Settings
            1,  // Away Settings
            0,  // Schedule Day
            1,  // Schedule Hold
            1,  // Heat Blast
            1,  // Service Reminders Status
            0,  // Alerts Status
            0,  // Alerts Settings
            1,  // Backlight Settings
            1,  // Thermostat Location & Name
            0,  // Reserved
            1,  // Controlling Sensor Values
            1,  // Over the air ODT update timeout
            1,  // Thermostat Status
            1,  // IAQ Status
            1,  // Model & Revision
            1,  // Support Module
            0,  // Lockouts
        ]));
        payload.writeUInt8(1);
        return payload;
    }
}
