import { Online, Refresh, ScryptedDeviceBase, Setting, Settings, SettingValue } from '@scrypted/sdk';
import { StorageSettings, StorageSettingsDevice } from '@scrypted/sdk/storage-settings';



export class AprilaireBase extends ScryptedDeviceBase implements Online, Settings, StorageSettingsDevice {
    storageSettings = new StorageSettings(this, {
        ipAddress: {
            title: "IP Address",
            group: 'Credentials',
            type: "string",
            placeholder: "192.168.1.XX",
            description: "The IP Address of the fan on your local network."
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
