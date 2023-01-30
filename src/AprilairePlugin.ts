import sdk, { Device, DeviceCreator, DeviceCreatorSettings, ScryptedDeviceType, ScryptedInterface, SettingValue } from '@scrypted/sdk';
import { DeviceProvider, ScryptedDeviceBase, Setting, Settings } from '@scrypted/sdk';
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import { AprilaireClient } from './AprilaireClient';
import { BasePayloadResponse } from "./BasePayloadResponse";
import { AprilaireThermostat } from './AprilaireThermostat';
import { ControllingSensorsStatusAndValueResponse, TemperatureSensorStatus, WrittenOutdoorTemperatureValueRequest } from './FunctionalDomainSensors';
import { ThermostatInstallerSettingsResponse, OutdoorSensorStatus } from './FunctionalDomainSetup';
import { HoldType, ScheduleHoldRequest, ScheduleHoldResponse } from './FunctionalDomainScheduling';

const { deviceManager } = sdk;

export class AprilairePlugin extends ScryptedDeviceBase implements DeviceProvider, DeviceCreator, Settings {
    storageSettings = new StorageSettings(this, {
        syncOutdoorSensor: {
            title: "Sync Outdoor Sensors",
            type: "boolean",
            description: "If one of your thermostats has an outdoor sensor, allow the value to be synced to your other thermostats that don't have outdoor sensors installed."
        },
        syncAwayHold: {
            title: "Sync Away Hold",
            type: "boolean",
            description: "If one of your thermostats is set to away, allow the hold to be synced to your other thermostats."
        },
        syncVacationHold: {
            title: "Sync Vacation Hold",
            type: "boolean",
            description: "If one of your thermostats is set to vacation, allow the hold to be synced to your other thermostats."
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

        else if (response instanceof ScheduleHoldResponse) {
            if ((response.hold === HoldType.Vacation && this.storageSettings.values.syncVacationHold) || (response.hold === HoldType.Away && this.storageSettings.values.syncAwayHold)) {
                let request = new ScheduleHoldRequest();
                request.hold = response.hold;
                request.fan = response.fan;
                request.heatSetpoint = response.heatSetpoint;
                request.coolSetpoint = response.coolSetpoint;
                request.dehumidifierSetpoint = response.dehumidifierSetpoint;
                request.endDate = response.endDate;
                
                // write teh hold to the other thermostats
                self.clients.forEach((client, mac) => {
                    if (mac === responseClient.mac)
                        return;

                    client.write(request);
                });
            }
        }

        else if (response instanceof ControllingSensorsStatusAndValueResponse && this.storageSettings.values.syncOutdoorSensor) {
            if (response.outdoorTemperatureStatus !== TemperatureSensorStatus.NoError)
                return;

            self.automatedOutdoorSensors.filter(mac => mac !== responseClient.mac).forEach(mac => {
                let request = new WrittenOutdoorTemperatureValueRequest();
                request.temperature = response.outdoorTemperature;

                const client = self.clients.get(mac);
                client.write(request);
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

            const { nativeId, device, thermostat } = await this.connectThermostat(host, port);
            return thermostat;
        }

        return undefined;
    }

    private connectThermostat(host: string, port: number) : Promise<any> {
        const client = new AprilaireClient(host, port);
        const self = this;

        client.on("response", (response, client) => {
            self.responseReceived(response, client, self);
        });

        return new Promise<any>((resolve) => {
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
                        ScryptedInterface.Settings,
                        ScryptedInterface.Refresh
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

                const t = new AprilaireThermostat(d.nativeId, client);
                t.sync();

                self.clients.set(d.nativeId, client);
                self.thermostats.set(d.nativeId, t);

                resolve({nativeId: d.nativeId, device: d, thermostat: t });
            });
        });
    }

    async createDevice(settings: DeviceCreatorSettings): Promise<string> {
        const host = settings.host.toString();
        const port = Number(settings.port);

        const { nativeId, device, thermostat } = await this.connectThermostat(host, port);
        return nativeId;
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
