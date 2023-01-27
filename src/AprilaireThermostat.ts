import { HumiditySettingStatus, HumidityCommand, HumidityMode, HumiditySensor, HumiditySetting, OnOff, Online, ScryptedDeviceBase, Setting, SettingValue, Settings, TemperatureSetting, TemperatureUnit, Thermometer, ThermostatMode } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { BasePayloadResponse, ControllingSensorsStatusAndValueResponse, DehumidificationSetpointResponse, FanStatus, HumidificationSetpointResponse, HumiditySensorStatus, TemperatureSensorStatus, ThermostatAndIAQAvailableResponse, ThermostatCapabilities, ThermostatSetpointAndModeSettingsRequest, ThermostatSetpointAndModeSettingsResponse, ThermostatMode as TMode } from './payloads';
import { StorageSettings, StorageSettingsDevice } from '@scrypted/sdk/storage-settings';

export class AprilaireThermostat extends ScryptedDeviceBase implements OnOff, Online, Settings, StorageSettingsDevice, TemperatureSetting, Thermometer, HumiditySetting, HumiditySensor {
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

    client: AprilaireClient;
    last = new Map<string, BasePayloadResponse>();

    humdifierOn: boolean = false;
    dehumdifierOn: boolean = false;

    constructor(nativeId: string, client: AprilaireClient) {
        super(nativeId);

        const self = this;

        this.humiditySetting = {
            mode: HumidityMode.Off,
            availableModes: [HumidityMode.Off]
        };

        this.client = client;
        this.client.on("response", (response: BasePayloadResponse) => {
            self.processResponse(response);
        });
    }

    setHumidity(humidity: HumidityCommand): Promise<void> {
        throw new Error('Method not implemented.');
    }

    getSettings(): Promise<Setting[]> {
        return this.storageSettings.getSettings();
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }

    refresh() {
        this.client.requestThermostatIAQAvailable();
        this.client.requestThermostatSetpointAndModeSettings();
    }

    private processResponse(response: BasePayloadResponse) {
        this.last.set(response.constructor.name, response);

        if (response instanceof ControllingSensorsStatusAndValueResponse) {
            if (response.indoorTemperatureStatus === TemperatureSensorStatus.NoError)
                this.temperature = response.indoorTemperature;

            if (response.indoorHumidityStatus === HumiditySensorStatus.NoError)
                this.humidity = response.indoorHumidity;
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse) {
            switch(response.thermostat) {
                case ThermostatCapabilities.Cool:
                    this.thermostatAvailableModes = [ThermostatMode.FanOnly, ThermostatMode.Cool];
                    break;
                case ThermostatCapabilities.Heat:
                    this.thermostatAvailableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat];
                    break;
                case ThermostatCapabilities.HeatAndCool: 
                    this.thermostatAvailableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool];
                    break;
                case ThermostatCapabilities.HeatCoolAndAuto:
                    this.thermostatAvailableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool, ThermostatMode.Auto];
                    break;
                case ThermostatCapabilities.HeatEmergencyHeatAndCool:
                    this.thermostatAvailableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool];
                    break;
                case ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto:
                    this.thermostatAvailableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool, ThermostatMode.Auto];
                    break;
            }

            let modes: HumidityMode[] = [HumidityMode.Off];
            if (response.humidification)
                modes.push(HumidityMode.Humidify);
            if (response.dehumidification)
                modes.push(HumidityMode.Dehumidify);
            if (response.humidification && response.dehumidification)
                modes.push(HumidityMode.Auto);

            this.humiditySetting.availableModes = modes;
        }

        else if (response instanceof HumidificationSetpointResponse) {
            this.humdifierOn = response.on;

            if (response.on)
                this.humiditySetting.humidifierSetpoint = response.humidificationSetpoint;
        }

        else if (response instanceof DehumidificationSetpointResponse) {
            this.dehumdifierOn = response.on;

            if (response.on)
                this.humiditySetting.dehumidifierSetpoint = response.dehumidificationSetpoint;
        }

        else if (response instanceof ThermostatSetpointAndModeSettingsResponse) {
            switch(response.mode) {
                case TMode.Auto: 
                    this.on = true;
                    this.thermostatMode = this.thermostatActiveMode = ThermostatMode.Auto;
                    break;
                case TMode.Cool:
                    this.on = true;
                    this.thermostatMode = this.thermostatActiveMode = ThermostatMode.Cool;
                    break;
                case TMode.Heat:
                    this.on = true;
                    this.thermostatMode = this.thermostatActiveMode = ThermostatMode.Heat;
                    break;
                case TMode.EmergencyHeat:
                    this.on = true;
                    this.thermostatMode = this.thermostatActiveMode = ThermostatMode.Heat;
                    break;
                case TMode.Off:
                    this.on = false;
                    this.thermostatMode = this.thermostatActiveMode = ThermostatMode.FanOnly;
                    break;
            }

            switch(this.thermostatMode) {
                case ThermostatMode.Heat:
                    this.thermostatSetpoint = response.heatSetpoint;
                    break;
                case ThermostatMode.Cool:
                    this.thermostatSetpoint = response.coolSetpoint;
                    break;
                default:
                    this.thermostatSetpoint = response.heatSetpoint;
                    break;
            }

            this.thermostatSetpointLow = Math.max(response.coolSetpoint, response.heatSetpoint);
            this.thermostatSetpointHigh = Math.max(response.coolSetpoint, response.heatSetpoint);
        }

        if (this.humdifierOn && !this.dehumdifierOn)
            this.humiditySetting.mode = this.humiditySetting.activeMode = HumidityMode.Humidify;
        else if (!this.humdifierOn && this.dehumdifierOn)
            this.humiditySetting.mode = this.humiditySetting.activeMode = HumidityMode.Dehumidify;
        else if (this.humdifierOn && this.dehumdifierOn)
            this.humiditySetting.mode = this.humiditySetting.activeMode = HumidityMode.Auto;
        else 
            this.humiditySetting.mode = this.humiditySetting.activeMode = HumidityMode.Off;
    }

    async turnOff(): Promise<void> {
    }
    async turnOn(): Promise<void> {
    }
    async setTemperatureUnit(temperatureUnit: TemperatureUnit): Promise<void> {
    }
    async setThermostatMode(mode: ThermostatMode): Promise<void> {
        let request = new ThermostatSetpointAndModeSettingsRequest();

        switch(mode) {
            case ThermostatMode.On:
            case ThermostatMode.Auto:
            case ThermostatMode.HeatCool:
                request.mode = TMode.Auto;
                break;
            
            case ThermostatMode.Cool:
                request.mode = TMode.Cool;
                break;

            case ThermostatMode.Heat:
                request.mode = TMode.Heat;
                break;

            case ThermostatMode.Off:
            case ThermostatMode.FanOnly:
                request.mode = TMode.Off;
                break;
        }
        
        this.client.write(request);
    }
    async setThermostatSetpoint(degrees: number): Promise<void> {
        let request = new ThermostatSetpointAndModeSettingsRequest();
        
        switch(this.thermostatMode) {
            case ThermostatMode.Heat:
                request.heatSetpoint = degrees;
                break;
            case ThermostatMode.Cool:
                request.coolSetpoint = degrees;
                break;
            default:
                request.heatSetpoint = degrees;
                break;
        }

        this.client.write(request);
    }
    async setThermostatSetpointHigh(high: number): Promise<void> {
        let request = new ThermostatSetpointAndModeSettingsRequest();
        request.coolSetpoint = high;
        this.client.write(request);
    }
    async setThermostatSetpointLow(low: number): Promise<void> {
        let request = new ThermostatSetpointAndModeSettingsRequest();
        request.heatSetpoint = low;
        this.client.write(request);
    }
}
