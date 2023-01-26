import { Fan, HumidityMode, Online, Refresh, ScryptedDeviceBase, Setting, Settings, SettingValue } from '@scrypted/sdk';
import { StorageSettings, StorageSettingsDevice } from '@scrypted/sdk/storage-settings';

export class AprilaireBase extends ScryptedDeviceBase implements Online, Settings, StorageSettingsDevice {
    storageSettings = new StorageSettings(this, {
        host: {
            title: "IP Address",
            type: "string",
            placeholder: "192.168.1.XX",
            description: "The IP Address of the fan on your local network."
        },
       port: {
            title: "Port",
            type: "number",
            placeholder: "8000",
            description: "The port the termostat uses to communicate, typically 8000 for 8800 series, and 7000 for 6000 series thermostats."
        }
    });

    constructor(nativeId: string) {
        super(nativeId);
    }

    getSettings(): Promise<Setting[]> {
        return this.storageSettings.getSettings();
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }
}