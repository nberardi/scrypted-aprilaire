import { HumidityMode, Online, ScryptedDeviceBase, Setting, SettingValue, Settings, FanMode, Refresh } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { BasePayloadResponse } from "./BasePayloadResponse";
import { StorageSettings, StorageSettingsDevice } from '@scrypted/sdk/storage-settings';
import { ControllingSensorsStatusAndValueResponse, TemperatureSensorStatus, HumiditySensorStatus, ControllingSensorsStatusAndValueRequest, SensorValuesResponse } from './FunctionalDomainSensors';
import { SyncRequest, OfflineResponse, ThermostatStatusRequest } from './FunctionalDomainStatus';

export enum AprilaireSystemType {
    Thermostat,
    Humidifier,
    Dehumidifier,
    Ventilation,
    Purifier
}

export class AprilaireThermostatBase extends ScryptedDeviceBase implements Online, Refresh {
    private last = new Map<string, BasePayloadResponse>();

    constructor(nativeId: string, public client: AprilaireClient, public systemType: AprilaireSystemType) {
        super(nativeId);

        this.humiditySetting = {
            mode: HumidityMode.Off,
            availableModes: [HumidityMode.Off]
        };

        this.fan = {
            speed: 0,
            availableModes: [FanMode.Auto, FanMode.Manual]
        };

        this.client = client;
        this.client.on("response", this.processResponse.bind(this));
    }

    async getRefreshFrequency(): Promise<number> {
        return 300; // every 5 mins
    }

    async refresh(refreshInterface: string, userInitiated: boolean): Promise<void> {
        if (refreshInterface === "TemperatureSetting") {
            this.client.read(new ThermostatStatusRequest());
            return;
        } else if (refreshInterface === "Thermometer" || refreshInterface === "HumiditySensor" || refreshInterface === "Fan") {
            this.client.read(new ControllingSensorsStatusAndValueRequest());
            return;
        }

        // this needs to be implemented to support the refresh frequency
        this.console.warn("refreshing", refreshInterface, userInitiated);
    }

    processResponse(response: BasePayloadResponse) {
        this.last.set(response.constructor.name, response);

        if (response instanceof ControllingSensorsStatusAndValueResponse || response instanceof SensorValuesResponse) {
            try {
                this.console.group("Controlling Sensors Status And Value");

                if (response.indoorTemperatureStatus === TemperatureSensorStatus.NoError) {
                    this.temperature = response.indoorTemperature;
                    this.console.info("indoor temperature: " + this.temperature + " C");
                }
                else if (response.indoorTemperatureStatus !== TemperatureSensorStatus.NotInstalled)
                    this.console.error("indoor temperature sensor error: " + response.indoorTemperatureStatus);

                if (response.indoorHumidityStatus === HumiditySensorStatus.NoError) {
                    this.humidity = response.indoorHumidity;
                    this.console.info("indoor humidity: " + this.humidity + "%");
                }
                else if (response.indoorHumidityStatus !== HumiditySensorStatus.NotInstalled)
                    this.console.error("indoor humidity sensor error: " + response.indoorHumidityStatus);

                if (response.outdoorTemperatureStatus === TemperatureSensorStatus.NoError) {
                    this.console.info("outdoor temperature: " + response.outdoorTemperature + " C");
                } else if (response.outdoorTemperatureStatus !== TemperatureSensorStatus.NotInstalled)
                    this.console.error("outdoor temperature sensor error: " + response.outdoorTemperatureStatus);

                if (response.outdoorHumidityStatus === HumiditySensorStatus.NoError) {
                    this.console.info("outdoor humidity: " + response.outdoorHumidity + "%");
                } else if (response.outdoorHumidityStatus !== HumiditySensorStatus.NotInstalled)
                    this.console.error("outdoor humidity sensor error: " + response.outdoorHumidityStatus);
            } finally {
                this.console.groupEnd();
            }
        }

        else if (response instanceof OfflineResponse) {
            this.on = response.offline === false;
        }
    }
}
