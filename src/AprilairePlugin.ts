import sdk, { Device, DeviceCreator, DeviceCreatorSettings, ScryptedDeviceType, ScryptedInterface, SettingValue } from '@scrypted/sdk';
import { DeviceProvider, ScryptedDeviceBase, Setting, Settings } from '@scrypted/sdk';
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import { AprilaireClient, BasePayloadResponse } from './AprilaireClient';
import { AprilaireThermostat } from './AprilaireThermostat';
import { ControllingSensorsStatusAndValueResponse, TemperatureSensorStatus, WrittenOutdoorTemperatureValueRequest } from './FunctionalDomainSensors';
import { ThermostatInstallerSettingsResponse, OutdoorSensorStatus } from './FunctionalDomainSetup';

const { deviceManager } = sdk;

export class AprilairePlugin extends ScryptedDeviceBase implements DeviceProvider, DeviceCreator, Settings {
    storageSettings = new StorageSettings(this, {
        syncOutdoorSensor: {
            title: "Sync Outdoor Sensors",
            type: "boolean",
            description: "If one of your devices has an outdoor sensor, allow the value to be synced to your other thermostats that don't have outdoor sensors installed."
        }
    });

    clients = new Map<string, AprilaireClient>();
    thermostats = new Map<string, AprilaireThermostat>();
    automatedOutdoorSensors: string[] = [];

    constructor(nativeId?: string) {
        super(nativeId);     
    }

    private responseReceived(response: BasePayloadResponse, responseClient: AprilaireClient, self: AprilairePlugin) {
        if (response instanceof ThermostatInstallerSettingsResponse) {
            if (response.outdoorSensor === OutdoorSensorStatus.Automation)
                if (this.automatedOutdoorSensors.indexOf(responseClient.mac) === -1)
                    this.automatedOutdoorSensors.push(responseClient.mac);
        }

        if (response instanceof ControllingSensorsStatusAndValueResponse && this.storageSettings.values.syncOutdoorSensor) {
            if (response.outdoorTemperatureStatus !== TemperatureSensorStatus.NoError)
                return;

            self.automatedOutdoorSensors.forEach(mac => {
                if (mac !== responseClient.mac) {
                    let request = new WrittenOutdoorTemperatureValueRequest();
                    request.temperature = response.outdoorTemperature;

                    const client = self.clients.get(mac);
                    client.write(request);
                }
            });
        }
    }

    getSettings(): Promise<Setting[]> {
        return this.storageSettings.getSettings();
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }

    async getDevice(nativeId: string): Promise<AprilaireThermostat> {
        if (this.thermostats.has(nativeId))
            return this.thermostats.get(nativeId);

        let s = deviceManager.getDeviceStorage(nativeId);
        if (s) {
            const host = s.getItem("host");
            const port = Number(s.getItem("port"));
            const self = this;

            let c = new AprilaireClient(host, port);
            c.on("response", (response, client) => {
                self.responseReceived(response, client, self);
            });

            let d = new AprilaireThermostat(nativeId, c);
            c.connect();
            d.refresh();

            this.thermostats.set(nativeId, d);
            this.clients.set(nativeId, c);

            return d;
        }
    }

    async createDevice(settings: DeviceCreatorSettings): Promise<string> {
        const host = settings.host.toString();
        const port = Number(settings.port);
        const client = new AprilaireClient(host, port);

        const self = this;

        return new Promise<string>((resolve) => {
            client.connect();
            client.once("ready", async () => {

                const d: Device = {
                    providerNativeId: self.nativeId,
                    name: client.name,
                    type: ScryptedDeviceType.Thermostat,
                    nativeId: client.mac,
                    interfaces: [
                        ScryptedInterface.TemperatureSetting,
                        ScryptedInterface.Thermometer,
                        ScryptedInterface.HumiditySensor,
                        ScryptedInterface.Fan,
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

                if (client.system.humidification || client.system.dehumidification)
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
