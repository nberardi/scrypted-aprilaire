import sdk, { Device, DeviceBase, DeviceCreator, DeviceCreatorSettings, ScryptedDevice, ScryptedDeviceType, ScryptedInterface, SettingValue, TemperatureUnit, Thermometer } from '@scrypted/sdk';
import { DeviceProvider, ScryptedDeviceBase, Setting, Settings } from '@scrypted/sdk';
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import { AprilaireClient } from './AprilaireClient';
import { BasePayloadResponse } from "./BasePayloadResponse";
import { AprilaireThermostat } from './AprilaireThermostat';
import { ControllingSensorsStatusAndValueRequest, ControllingSensorsStatusAndValueResponse, TemperatureSensorStatus, WrittenOutdoorTemperatureValueRequest } from './FunctionalDomainSensors';
import { ThermostatInstallerSettingsResponse, OutdoorSensorStatus } from './FunctionalDomainSetup';
import { HoldType, ScheduleHoldRequest, ScheduleHoldResponse } from './FunctionalDomainScheduling';
import { SyncRequest } from './FunctionalDomainStatus';
import { setInterval } from 'node:timers';
import { AprilaireOutdoorThermometer } from './AprilaireOutdoorThermometer';

const { deviceManager, systemManager } = sdk;

export class AprilairePlugin extends ScryptedDeviceBase implements DeviceProvider, DeviceCreator, Settings {
    storageSettings = new StorageSettings(this, {
        syncOutdoorSensor: {
            title: "Sync Outdoor Sensors",
            type: "boolean",
            description: "If one of your thermostats has an outdoor sensor, allow the value to be synced to your other thermostats that don't have outdoor sensors installed."
        },
        syncOutdoorSensorInterval: {
            title: "Sync Outdoor Sensor Interval",
            type: "number",
            defaultValue: 1,
            description: "The number of minutes between how often to sync the outdoor sensor value to thermostats that don't have an outdoor sensor installed.",
            onPut: this.setupOutdoorsSensorsInterval.bind(this)
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
    outdoorSensors = new Map<string, AprilaireOutdoorThermometer>();
    automatedOutdoorSensors: string[] = [];
    automatedOutdoorSensorsTimer: NodeJS.Timer;

    constructor(nativeId?: string) {
        super(nativeId);

        this.setupOutdoorsSensorsInterval(0, this.storageSettings.values.syncOutdoorSensorInterval);
    }

    async releaseDevice(id: string, nativeId: string): Promise<void> {
        if (this.thermostats.has(nativeId))
            this.thermostats.delete(nativeId);
    }

    private setupOutdoorsSensorsInterval(oldValue: any, newValue: any) {
        if (newValue === 0) {
            clearInterval(this.automatedOutdoorSensorsTimer);
            return;
        }

        clearInterval(this.automatedOutdoorSensorsTimer);
        this.automatedOutdoorSensorsTimer = setInterval(this.refreshOutdoorSensors.bind(this), newValue * 60 * 1000);
    }

    private async refreshOutdoorSensors() {
        if (this.storageSettings.values.syncOutdoorSensor === false)
            return;

        this.clients.forEach((client, mac) => {
            if (this.automatedOutdoorSensors.indexOf(mac) >= 0)
                return;

            let request = new ControllingSensorsStatusAndValueRequest();
            client.read(request);
        });
    }

    private responseReceived(response: BasePayloadResponse, responseClient: AprilaireClient) {
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
                this.clients.forEach((client, mac) => {
                    if (mac === responseClient.mac)
                        return;

                    client.write(request);
                });
            }
        }

        else if (response instanceof ControllingSensorsStatusAndValueResponse && this.storageSettings.values.syncOutdoorSensor) {
            if (response.outdoorTemperatureStatus !== TemperatureSensorStatus.NoError)
                return;

            if (this.automatedOutdoorSensors.indexOf(responseClient.mac) === -1)
                this.setOutdoorTemperature(response, responseClient);

            this.automatedOutdoorSensors
                .filter(mac => mac !== responseClient.mac)
                .forEach(mac => {
                    let request = new WrittenOutdoorTemperatureValueRequest();
                    request.temperature = response.outdoorTemperature;

                    const client = this.clients.get(mac);
                    client.write(request);
            });
        }
    }

    async getOrAddOutdoorSensor(responseClient: AprilaireClient): Promise<AprilaireOutdoorThermometer> {
        if (this.outdoorSensors.has(responseClient.mac))
            return this.outdoorSensors.get(responseClient.mac);

        const d: Device = {
            providerNativeId: this.nativeId,
            name: responseClient.name + " Outdoor Temperature Sensor",
            type: ScryptedDeviceType.Sensor,
            nativeId: responseClient.mac + "|OutdoorTemperatureSensor",
            interfaces: [
                ScryptedInterface.Thermometer
            ],
            info: {
                model: responseClient.model,
                manufacturer: "Aprilaire",
                serialNumber: responseClient.mac,
                firmware: responseClient.firmware,
                version: responseClient.hardware
            }
        }
        
        await deviceManager.onDeviceDiscovered(d);
        
        const o = new AprilaireOutdoorThermometer(d.nativeId);
        this.outdoorSensors.set(responseClient.mac, o);

        return o;
    }

    async setOutdoorTemperature(response: ControllingSensorsStatusAndValueResponse, responseClient: AprilaireClient) : Promise<void> {
        if (response.outdoorTemperatureStatus === TemperatureSensorStatus.NoError && response.outdoorTemperature !== undefined) {
            const outdoorSensor = await this.getOrAddOutdoorSensor(responseClient);
            outdoorSensor.temperature = response.outdoorTemperature;
            outdoorSensor.setTemperatureUnit(TemperatureUnit.C);
        }
    }

    getSettings(): Promise<Setting[]> {
        return this.storageSettings.getSettings();
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }

    async getDevice(nativeId: string): Promise<any> {
        if (this.thermostats.has(nativeId))
            return this.thermostats.get(nativeId);

        if (nativeId.endsWith("|OutdoorTemperatureSensor")) {
            const o = new AprilaireOutdoorThermometer(nativeId);
            return o;
        }

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

        client.on("response", self.responseReceived.bind(self));

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

                // send a sync request to get a refresh of the current state
                client.write(new SyncRequest());

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