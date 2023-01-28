import { HumiditySettingStatus, HumidityCommand, HumidityMode, HumiditySensor, HumiditySetting, OnOff, Online, ScryptedDeviceBase, Setting, SettingValue, Settings, TemperatureSetting, TemperatureUnit, Thermometer, ThermostatMode, Fan, FanState, FanMode, FanStatus } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { BasePayloadResponse, ControllingSensorsStatusAndValueResponse, CoolingStatus, DehumidificationSetpointResponse, DehumidificationStatus, FanModeSetting, HeatingStatus, HumidificationSetpointResponse, HumidificationStatus, HumiditySensorStatus, IAQStatusResponse, TemperatureSensorStatus, ThermostatAndIAQAvailableResponse, ThermostatCapabilities, ThermostatSetpointAndModeSettingsRequest, ThermostatSetpointAndModeSettingsResponse, ThermostatStatusResponse, ThermostatMode as TMode } from './payloads';
import { StorageSettings, StorageSettingsDevice } from '@scrypted/sdk/storage-settings';

export class AprilaireThermostat extends ScryptedDeviceBase implements OnOff, Online, Settings, StorageSettingsDevice, TemperatureSetting, Thermometer, HumiditySetting, HumiditySensor, Fan {
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

        this.fan = {
            speed: 0,
            availableModes: [FanMode.Auto, FanMode.Manual]
        }

        this.client = client;
        this.client.on("response", (response: BasePayloadResponse) => {
            self.processResponse(response);
        });
    }
    setFan(fan: FanState): Promise<void> {
        throw new Error('Method not implemented.');
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

        let fan: FanStatus = JSON.parse(JSON.stringify(this.fan));
        let humiditySetting: HumiditySettingStatus = JSON.parse(JSON.stringify(this.humiditySetting));

        if (response instanceof ControllingSensorsStatusAndValueResponse) {
            if (response.indoorTemperatureStatus === TemperatureSensorStatus.NoError)
                this.temperature = response.indoorTemperature;

            if (response.indoorHumidityStatus === HumiditySensorStatus.NoError)
                this.humidity = response.indoorHumidity;
        }

        else if (response instanceof ThermostatStatusResponse) {
            const heating = response.heating !== HeatingStatus.NotActive && response.heating !== HeatingStatus.EquipmentWait;
            const cooling = response.cooling !== CoolingStatus.NotActive && response.cooling !== CoolingStatus.EquipmentWait;

            if (heating)
                this.thermostatActiveMode = ThermostatMode.Heat;
            else if (cooling)
                this.thermostatActiveMode = ThermostatMode.Cool;
            else
                this.thermostatActiveMode = ThermostatMode.Off;

            fan.speed = response.fan;
        }

        else if (response instanceof IAQStatusResponse) {
            const humidification = response.humidification === HumidificationStatus.Active;
            const dehumidification = response.dehumidification === DehumidificationStatus.WholeHomeActive || response.dehumidification === DehumidificationStatus.OvercoolingToDehumidify;

            if (humidification && !dehumidification)
                humiditySetting.activeMode = HumidityMode.Humidify;
            else if (!humidification && dehumidification)
                humiditySetting.activeMode = HumidityMode.Dehumidify;
            else if (humidification && dehumidification)
                humiditySetting.activeMode = HumidityMode.Auto;
            else 
                humiditySetting.activeMode = HumidityMode.Off;
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

            humiditySetting.availableModes = modes;
        }

        else if (response instanceof HumidificationSetpointResponse) {
            this.humdifierOn = response.on;

            if (response.on)
                humiditySetting.humidifierSetpoint = response.humidificationSetpoint;

            if (this.humdifierOn && !this.dehumdifierOn)
                humiditySetting.mode = HumidityMode.Humidify;
            else if (!this.humdifierOn && this.dehumdifierOn)
                humiditySetting.mode = HumidityMode.Dehumidify;
            else if (this.humdifierOn && this.dehumdifierOn)
                humiditySetting.mode = HumidityMode.Auto;
            else 
                humiditySetting.mode = HumidityMode.Off;
        }

        else if (response instanceof DehumidificationSetpointResponse) {
            this.dehumdifierOn = response.on;

            if (response.on)
            humiditySetting.dehumidifierSetpoint = response.dehumidificationSetpoint;

            if (this.humdifierOn && !this.dehumdifierOn)
                humiditySetting.mode = HumidityMode.Humidify;
            else if (!this.humdifierOn && this.dehumdifierOn)
                humiditySetting.mode = HumidityMode.Dehumidify;
            else if (this.humdifierOn && this.dehumdifierOn)
                humiditySetting.mode = HumidityMode.Auto;
            else 
                humiditySetting.mode = HumidityMode.Off;
        }

        else if (response instanceof ThermostatSetpointAndModeSettingsResponse) {
            switch(response.mode) {
                case TMode.Auto: 
                    this.on = true;
                    this.thermostatMode = ThermostatMode.Auto
                    break;
                case TMode.Cool:
                    this.on = true;
                    this.thermostatMode = ThermostatMode.Cool
                    break;
                case TMode.Heat:
                case TMode.EmergencyHeat:
                    this.on = true;
                    this.thermostatMode = ThermostatMode.Heat
                    break;
                case TMode.Off:
                    this.on = false;
                    this.thermostatMode = ThermostatMode.FanOnly
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

            fan.mode = response.fan === FanModeSetting.Auto ? FanMode.Auto : FanMode.Manual;
        }

        if (!this.thermostatActiveMode)
            this.thermostatActiveMode = this.thermostatMode;

        if (!humiditySetting.activeMode)
            humiditySetting.activeMode = this.humiditySetting.mode;

        this.fan = fan;
        this.humiditySetting = humiditySetting;
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
