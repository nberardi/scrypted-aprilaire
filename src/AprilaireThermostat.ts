import { HumiditySettingStatus, HumidityCommand, HumidityMode, HumiditySensor, HumiditySetting, OnOff, Online, ScryptedDeviceBase, Setting, SettingValue, Settings, TemperatureSetting, TemperatureUnit, Thermometer, ThermostatMode, Fan, FanState, FanMode, FanStatus, Refresh } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { BasePayloadResponse } from "./BasePayloadResponse";
import { StorageSettings, StorageSettingsDevice } from '@scrypted/sdk/storage-settings';
import { ThermostatSetpointAndModeSettingsRequest, FanModeSetting, DehumidificationSetpointRequest, HumidificationSetpointRequest, ThermostatAndIAQAvailableResponse, ThermostatCapabilities, HumidificationSetpointResponse, DehumidificationSetpointResponse, ThermostatSetpointAndModeSettingsResponse, ThermostatMode as TMode } from './FunctionalDomainControl';
import { ControllingSensorsStatusAndValueResponse, TemperatureSensorStatus, HumiditySensorStatus, ControllingSensorsStatusAndValueRequest } from './FunctionalDomainSensors';
import { ScaleRequest, TemperatureScale, ScaleResponse, ThermostatInstallerSettingsResponse } from './FunctionalDomainSetup';
import { ThermostatStatusResponse, HeatingStatus, CoolingStatus, IAQStatusResponse, HumidificationStatus, DehumidificationStatus, SyncRequest, VentilationStatus, AirCleaningStatus, OfflineResponse, ThermostatStatusRequest } from './FunctionalDomainStatus';
import { HeatBlastRequest, HeatBlastResponse, HoldType, ScheduleHoldResponse } from './FunctionalDomainScheduling';

export class AprilaireThermostat extends ScryptedDeviceBase implements OnOff, Online, Settings, Refresh, StorageSettingsDevice, TemperatureSetting, Thermometer, HumiditySetting, HumiditySensor, Fan {

    readonly deviceOn = "On";
    readonly deviceOff = "Off";
    readonly holdSchedule = "Schedule";
    readonly holdTemporary = "Temporary";
    readonly holdPermanent = "Permanent";
    readonly holdAway = "Away";
    readonly holdVacation = "Vacation";

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
        },
        heatBlast: {
            title: "Heat Blast",
            type: "boolean",
            description: "The thermostat is in Heat Blast mode.",
            noStore: true,
            onPut: this.setHeatBlast.bind(this)
        },
        hold: {
            title: "Temperature Hold",
            type: "string",
            choices: ["Schedule", "Temporary", "Permanent", "Away", "Vacation"],
            description: "The type of temperature hold the thermostat is following.",
            noStore: true,
            onPut: this.setHold.bind(this)
        },
        humidifierAvailable: {
            type: "boolean",
            hide: true
        },
        humidifierState: {
            title: "Humidifier",
            type: "string",
            choices: ["On", "Off"],
            description: "The state of the humidifier."
        },
        humidifierSetpoint: {
            title: "Humidifier Setpoint",
            type: "integer",
            description: "The setpoint of the humidifier."
        },
        dehumidifierAvailable: {
            type: "boolean",
            hide: true
        },
        dehumidifierState: {
            title: "Dehumidifier",
            type: "string",
            choices: ["On", "Off"],
            description: "The state of the dehumidifier."
        },
        dehumidiferSetpoint: {
            title: "Dehumidifier Setpoint",
            type: "integer",
            description: "The setpoint of the dehumidifier."
        },
        freshAirVentilationAvailable: {
            type: "boolean",
            hide: true
        },
        freshAirVentilationState: {
            title: "Fresh Air",
            type: "string",
            choices: ["On", "Off"],
            description: "The state of the fresh air."
        },
        airCleaningAvailable: {
            type: "boolean",
            hide: true
        },
        airCleaningState: {
            title: "Air Cleaning",
            type: "string",
            choices: ["On", "Off"],
            description: "The state of the air cleaning."
        }
    });

    private client: AprilaireClient;
    private last = new Map<string, BasePayloadResponse>();

    private _heatBlastState: boolean;
    private _holdState: string;

    constructor(nativeId: string, client: AprilaireClient) {
        super(nativeId);

        this.humiditySetting = {
            mode: HumidityMode.Off,
            availableModes: [HumidityMode.Off]
        };

        this.fan = {
            speed: 0,
            availableModes: [FanMode.Auto, FanMode.Manual]
        }

        this.client = client;
        this.client.on("response", this.processResponse.bind(this));
    }

    async getRefreshFrequency(): Promise<number> {
        return 1800; // every 10 mins
    }

    async sync(): Promise<void> {
        let request = new SyncRequest();
        this.client.write(request);
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

    async setFan(fan: FanState): Promise<void> {
        let request = new ThermostatSetpointAndModeSettingsRequest();
        request.fan = fan.mode === FanMode.Auto ? FanModeSetting.Auto : FanModeSetting.Circulate;
        this.client.write(request);
    }

    async setHumidity(humidity: HumidityCommand): Promise<void> {
        let drequest = new DehumidificationSetpointRequest();
        let hrequest = new HumidificationSetpointRequest();

        if (humidity.dehumidifierSetpoint) {
            drequest.dehumidificationSetpoint = humidity.dehumidifierSetpoint;
        } 

        if (humidity.humidifierSetpoint) {
            hrequest.humidificationSetpoint = humidity.humidifierSetpoint;
        }

        if (humidity.mode) {
            switch(humidity.mode) {
                case HumidityMode.Off:
                    drequest.on = false;
                    hrequest.on = false;
                    break;

                case HumidityMode.Auto:
                    drequest.on = true;
                    hrequest.on = true;
                    break;

                case HumidityMode.Dehumidify:
                    drequest.on = true;
                    hrequest.on = false;
                    break;

                case HumidityMode.Humidify:
                    drequest.on = false;
                    hrequest.on = true;
                    break;
            }
        }

        this.client.write(drequest);
        this.client.write(hrequest);
    }

    turnOff(): Promise<void> {
        return this.setThermostatMode(ThermostatMode.Off);
    }

    turnOn(): Promise<void> {
        return this.setThermostatMode(ThermostatMode.On);
    }

    setHeatBlast(oldValue: any, newValue: any) {
        if (newValue === this._heatBlastState)
            return;

        let request = new HeatBlastRequest();
        request.heatBlast = Boolean(newValue);
        this.client.write(request);
        this._heatBlastState = request.heatBlast;
    }
    
    setHold(oldValue: any, newValue: any) {
        if (newValue === this._holdState)
            return;

        this.console.error("setHold function status is work still needs to be done");
    }

    async setTemperatureUnit(temperatureUnit: TemperatureUnit): Promise<void> {
        let request = new ScaleRequest();
        request.scale = temperatureUnit === TemperatureUnit.F ? TemperatureScale.F : TemperatureScale.C;
        this.client.write(request);
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

    async getSettings(): Promise<Setting[]> {
        let s = await this.storageSettings.getSettings();

        const h = this.storageSettings.values.humidifierAvailable;
        const d = this.storageSettings.values.dehumidifierAvailable;
        const v = this.storageSettings.values.freshAirVentilationAvailable;
        const p = this.storageSettings.values.airCleaningAvailable;

        const settings = s.filter(setting => {
            if (!h && setting.key.startsWith("humidifier"))
                return false;
            else if (!d && setting.key.startsWith("dehumidifer"))
                return false;
            else if (!v && setting.key.startsWith("freshAirVentilation"))
                return false;
            else if (!p && setting.key.startsWith("airCleaning"))
                return false;
            else
                return true;
        })

        return settings;
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }

    private convertHold (type: HoldType): string{
        switch(type) {
            case HoldType.Disabled: return this.holdSchedule;
            case HoldType.Temporary: return this.holdTemporary;
            case HoldType.Permanent: return this.holdPermanent;
            case HoldType.Away: return this.holdAway;
            case HoldType.Vacation: return this.holdVacation;
        }
    }

    private processResponse(response: BasePayloadResponse) {
        this.last.set(response.constructor.name, response);

        let fan: FanStatus = JSON.parse(JSON.stringify(this.fan));
        let humiditySetting: HumiditySettingStatus = JSON.parse(JSON.stringify(this.humiditySetting));

        if (response instanceof ScaleResponse) {
            this.temperatureUnit = response.scale === TemperatureScale.F ? TemperatureUnit.F : TemperatureUnit.C;
        }

        else if (response instanceof HeatBlastResponse) {
            this._heatBlastState = this._heatBlastState ?? response.heatBlast;
            this.storageSettings.values.heatBlast = this._heatBlastState;
        }

        else if (response instanceof ScheduleHoldResponse) {
            this._holdState = this._holdState ?? this.convertHold(response.hold);
            this.storageSettings.values.hold = this._holdState;
        }

        else if (response instanceof ThermostatInstallerSettingsResponse) {
            this.temperatureUnit = response.scale === TemperatureScale.F ? TemperatureUnit.F : TemperatureUnit.C;
        }

        else if (response instanceof ControllingSensorsStatusAndValueResponse) {
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

            this.storageSettings.values.humidifierState = response.humidification === HumidificationStatus.Off ? this.deviceOff : this.deviceOn;
            this.storageSettings.values.dehumidifierState = response.dehumidification === DehumidificationStatus.Off ? this.deviceOff : this.deviceOn;
            this.storageSettings.values.freshAirVentilationState = response.ventilation === VentilationStatus.Off ? this.deviceOff : this.deviceOn;
            this.storageSettings.values.airCleaningState = response.airCleaning === AirCleaningStatus.Off ? this.deviceOff : this.deviceOn;
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse) {
            try {
                this.console.group("Thermostat and IAQ Available");

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

                this.console.info("thermostat modes: " + this.thermostatAvailableModes);

                let modes: HumidityMode[] = [HumidityMode.Off];
                if (response.humidification)
                    modes.push(HumidityMode.Humidify);
                if (response.dehumidification)
                    modes.push(HumidityMode.Dehumidify);
                if (response.humidification && response.dehumidification)
                    modes.push(HumidityMode.Auto);

                humiditySetting.availableModes = modes;
                this.console.info("humidity modes: " + humiditySetting.availableModes);

                this.storageSettings.values.humidifierAvailable = response.humidification;
                this.storageSettings.values.dehumidifierAvailable = response.dehumidification;
                this.storageSettings.values.freshAirVentilationAvailable = response.freshAirVentilation;
                this.storageSettings.values.airCleaningAvailable = response.airCleaning;
                this.console.info(`humidifier: ${response.humidification}, dehumidifier: ${response.dehumidification}, fresh air ventilation: ${response.freshAirVentilation}, air cleaning: ${response.airCleaning}`);
            } finally {
                this.console.groupEnd();
            }
        }

        else if (response instanceof HumidificationSetpointResponse) {
            this.storageSettings.values.humidifierState = response.on ? this.deviceOn : this.deviceOff;

            const humdifierOn = this.storageSettings.values.humidifierState === this.deviceOn;
            const dehumdifierOn = this.storageSettings.values.dehumidifierState === this.deviceOn;

            if (humdifierOn) {
                this.storageSettings.values.humidifierSetpoint = response.humidificationSetpoint;
                humiditySetting.humidifierSetpoint = response.humidificationSetpoint;
            }

            if (humdifierOn && !dehumdifierOn)
                humiditySetting.mode = HumidityMode.Humidify;
            else if (!humdifierOn && dehumdifierOn)
                humiditySetting.mode = HumidityMode.Dehumidify;
            else if (humdifierOn && dehumdifierOn)
                humiditySetting.mode = HumidityMode.Auto;
            else 
                humiditySetting.mode = HumidityMode.Off;
        }

        else if (response instanceof DehumidificationSetpointResponse) {
            this.storageSettings.values.dehumidifierState = response.on ? this.deviceOn : this.deviceOff;

            const humdifierOn = this.storageSettings.values.humidifierState === this.deviceOn;
            const dehumdifierOn = this.storageSettings.values.dehumidifierState === this.deviceOn;

            if (dehumdifierOn) {
                this.storageSettings.values.dehumidiferSetpoint = response.dehumidificationSetpoint;
                humiditySetting.dehumidifierSetpoint = response.dehumidificationSetpoint;
            }

            if (humdifierOn && !dehumdifierOn)
                humiditySetting.mode = HumidityMode.Humidify;
            else if (!humdifierOn && dehumdifierOn)
                humiditySetting.mode = HumidityMode.Dehumidify;
            else if (humdifierOn && dehumdifierOn)
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

        else if (response instanceof OfflineResponse) {
            this.on = response.offline === false;
        }

        if (!this.thermostatActiveMode)
            this.thermostatActiveMode = this.thermostatMode;

        if (!humiditySetting.activeMode)
            humiditySetting.activeMode = this.humiditySetting.mode;

        this.fan = fan;
        this.humiditySetting = humiditySetting;
    }
}