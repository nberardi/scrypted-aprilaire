import sdk, { DeviceCreator, DeviceCreatorSettings, SettingValue } from '@scrypted/sdk';
import { DeviceProvider, ScryptedDeviceBase, Setting, Settings } from '@scrypted/sdk';
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import { AprilaireBase } from "./AprilaireBase";

const { deviceManager } = sdk;

export class AprilairePlugin extends ScryptedDeviceBase implements DeviceProvider, DeviceCreator, Settings {
    storageSettings = new StorageSettings(this, {
    });

    thermostats = new Map<string, AprilaireBase>();

    constructor(nativeId?: string) {
        super(nativeId);
    }
    getDevice(nativeId: string) {
        throw new Error('Method not implemented.');
    }

    async createDevice(settings: DeviceCreatorSettings): Promise<string> {
        const ipAddress = settings.ipAddress.toString();

        return ipAddress;
    }

    getSettings(): Promise<Setting[]> {
        return this.storageSettings.getSettings();
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }

    async getCreateDeviceSettings(): Promise<Setting[]> {
        return [
            {
                key: 'host',
                title: "IP Address",
                type: "string",
                placeholder: "192.168.1.XX",
                description: "The IP Address of the fan on your local network."
            },
            {
                key: 'port',
                title: "Port",
                type: "number",
                placeholder: "8000",
                description: "The port the termostat uses to communicate, typically 8000 for 8800 series, and 7000 for 6000 series thermostats."
            }
        ];
    }
}
