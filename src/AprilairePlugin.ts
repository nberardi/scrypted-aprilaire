import sdk, { Device, DeviceCreator, DeviceCreatorSettings, ScryptedDeviceType, ScryptedInterface, SettingValue } from '@scrypted/sdk';
import { DeviceProvider, ScryptedDeviceBase, Setting, Settings } from '@scrypted/sdk';
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import { AprilaireClient } from './AprilaireClient';
import { AprilaireThermostat } from './AprilaireThermostat';

const { deviceManager } = sdk;

export class AprilairePlugin extends ScryptedDeviceBase implements DeviceProvider, DeviceCreator, Settings {
    storageSettings = new StorageSettings(this, {
    });

    clients = new Map<string, AprilaireClient>();
    thermostats = new Map<string, AprilaireThermostat>();

    constructor(nativeId?: string) {
        super(nativeId);     
    }

    async getDevice(nativeId: string): Promise<AprilaireThermostat> {
        if (this.thermostats.has(nativeId))
            return this.thermostats.get(nativeId);

        let s = deviceManager.getDeviceStorage(nativeId);
        if (s) {
            const host = s.getItem("host");
            const port = Number(s.getItem("port"));

            let c = new AprilaireClient(host, port);
            let d = new AprilaireThermostat(nativeId, c);
            c.connect();
            d.refresh();

            this.thermostats.set(nativeId, d);
            this.clients.set(nativeId, c);
        }
    }

    async createDevice(settings: DeviceCreatorSettings): Promise<string> {
        const name = settings.name.toString();
        const host = settings.host.toString();
        const port = Number(settings.port);
        const client = new AprilaireClient(host, port);

        const self = this;

        return new Promise<string>((resolve, reject) => {
            client.connect();
            client.once("ready", async () => {

                const d: Device = {
                    providerNativeId: self.nativeId,
                    name: name,
                    type: ScryptedDeviceType.Thermostat,
                    nativeId: client.mac,
                    interfaces: [
                        ScryptedInterface.TemperatureSetting,
                        ScryptedInterface.Thermometer,
                        ScryptedInterface.HumiditySensor,
                        ScryptedInterface.OnOff,
                        ScryptedInterface.Online,
                        ScryptedInterface.Settings
                    ],
                    info: {
                        model: client.model,
                        manufacturer: "Aprilaire",
                        serialNumber: client.mac,
                        firmware: client.firmware,
                        version: client.hardware
                    }
                };

                if (client.system.humidification)
                    d.interfaces.push(ScryptedInterface.HumiditySetting);

                await deviceManager.onDeviceDiscovered(d);

                const s = deviceManager.getDeviceStorage(d.nativeId);
                s.setItem("host", host);
                s.setItem("port", port.toString());

                const thermostat = new AprilaireThermostat(d.nativeId, client);

                self.clients.set(d.nativeId, client);
                self.thermostats.set(d.nativeId, thermostat);

                resolve(d.nativeId);
            });
        });
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
                key: 'name',
                title: "Name",
                type: "string",
                placeholder: "Main Floor",
                description: "The name you would like to provide your thermostat."
            },
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
