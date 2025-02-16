import { Fan, FanMode, FanState, FanStatus, FilterMaintenance, HumidityCommand, HumidityMode, HumiditySensor, HumiditySetting, OnOff, Setting, SettingValue, Settings, TemperatureCommand, TemperatureSetting, TemperatureUnit, Thermometer, ThermostatMode } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { AprilaireSystemType, AprilaireThermostatBase } from './AprilaireThermostatBase';
import { DehumidificationSetpointResponse, FanModeSetting, HumidificationSetpointResponse, HumidificationState, ThermostatAndIAQAvailableResponse, ThermostatCapabilities, ThermostatSetpointAndModeSettingsRequest, ThermostatSetpointAndModeSettingsResponse, ThermostatMode as TMode} from './FunctionalDomainControl';
import { ScaleRequest, ScaleResponse, TemperatureScale, ThermostatInstallerSettingsResponse } from './FunctionalDomainSetup';
import { HeatBlastRequest, HeatBlastResponse, HoldType, ScheduleHoldResponse } from './FunctionalDomainScheduling';
import { CoolingStatus, FanStatus as TFanStatus, HeatingStatus, ThermostatStatusResponse } from './FunctionalDomainStatus';
import { BasePayloadResponse } from './BasePayloadResponse';
import { ServiceRemindersStatusResponse } from './FunctionalDomainAlerts';
import { StorageSettingsDevice, StorageSettings } from '@scrypted/sdk/storage-settings';

export class AprilaireThermostat extends AprilaireThermostatBase implements OnOff, Settings, StorageSettingsDevice, TemperatureSetting, Thermometer, HumiditySensor, HumiditySetting, FilterMaintenance, Fan {
    private _heatBlastState: boolean;
    private _holdState: string;

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
        }
    });

    constructor(nativeId: string, client: AprilaireClient) {
        super(nativeId, client, AprilaireSystemType.Thermostat);

        this.fan = {
            speed: 0,
            active: false,
            mode: FanMode.Auto,
            availableModes: [FanMode.Auto, FanMode.Manual]
        };

        this.humiditySetting = {
            dehumidifierSetpoint: 0,
            humidifierSetpoint: 0,
            mode: HumidityMode.Auto,
            availableModes: [HumidityMode.Auto, HumidityMode.Off]
        };
    }

    async setHumidity(humidity: HumidityCommand) {
        this.console.error("setHumidity function should not have been called from the Thermostat object");
    }

    async setFan(fan: FanState): Promise<void> {
        var setting = {...this.fan};
        setting.mode = fan.mode === FanMode.Auto ? FanMode.Auto : FanMode.Manual;
        setting.speed = fan.mode === FanMode.Auto ? 1 : 0;

        let request = new ThermostatSetpointAndModeSettingsRequest();
        request.fan = fan.mode === FanMode.Auto ? FanModeSetting.Auto : FanModeSetting.On;

        this.fan = setting;
        this.client.write(request);
    }

    async getSettings(): Promise<Setting[]> {
        let s = await this.storageSettings.getSettings();

        const hb = this.systemType === AprilaireSystemType.Thermostat && this.storageSettings.values.heatBlast;
        const h = this.systemType === AprilaireSystemType.Thermostat && this.storageSettings.values.hold;

        const settings = s.filter(setting => {
            if (!hb && setting.key.startsWith("heatBlast"))
                return false;
            else if (!h && setting.key.startsWith("hold"))
                return false;
            else
                return true;
        });

        return settings;
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
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

    turnOff(): Promise<void> {
        return this.setThermostatMode(ThermostatMode.Off);
    }

    turnOn(): Promise<void> {
        return this.setThermostatMode(ThermostatMode.On);
    }

    async setTemperature(command: TemperatureCommand): Promise<void> {
        let request = new ThermostatSetpointAndModeSettingsRequest();

        let { mode, setpoint } = command;

        var settings = { ...this.temperatureSetting };

        if (mode) {
            switch (mode) {
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

            settings.mode = mode;
        }

        if (setpoint) {
            if (typeof setpoint === 'number') {
                switch (mode ?? settings.mode) {
                    case ThermostatMode.Heat:
                        request.heatSetpoint = setpoint;
                        break;
                    case ThermostatMode.Cool:
                        request.coolSetpoint = setpoint;
                        break;
                    default:
                        request.heatSetpoint = setpoint;
                        break;
                }
            }
            else {
                request.coolSetpoint = Math.max(setpoint[0], setpoint[1]);
                request.heatSetpoint = Math.min(setpoint[0], setpoint[1]);                
            }

            settings.setpoint = setpoint;
        }

        this.temperatureSetting = settings;

        this.client.write(request);
    }

    async setTemperatureUnit(temperatureUnit: TemperatureUnit): Promise<void> {
        let request = new ScaleRequest();
        request.scale = temperatureUnit === TemperatureUnit.F ? TemperatureScale.F : TemperatureScale.C;
        this.client.write(request);
    }

    async setThermostatMode(mode: ThermostatMode): Promise<void> {
        let request = new ThermostatSetpointAndModeSettingsRequest();

        var settings = { ...this.temperatureSetting };

        switch (mode) {
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

        settings.mode = mode;
        this.temperatureSetting = settings;

        this.client.write(request);
    }

    async setThermostatSetpoint(degrees: number): Promise<void> {
        let request = new ThermostatSetpointAndModeSettingsRequest();

        switch (this.temperatureSetting.mode) {
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

    private convertHold(type: HoldType): string {
        switch (type) {
            case HoldType.Disabled: return this.holdSchedule;
            case HoldType.Temporary: return this.holdTemporary;
            case HoldType.Permanent: return this.holdPermanent;
            case HoldType.Away: return this.holdAway;
            case HoldType.Vacation: return this.holdVacation;
        }
    }

    processResponse(response: BasePayloadResponse) {
        let fan: FanStatus = JSON.parse(JSON.stringify(this.fan));

        var tempSettings = { ...this.temperatureSetting };
        var fanSettings = { ...this.fan };
        var humiditySetting = { ...this.humiditySetting };

        if (response instanceof ScaleResponse) {
            this.temperatureUnit = response.scale === TemperatureScale.F ? TemperatureUnit.F : TemperatureUnit.C;
        }

        else if (response instanceof DehumidificationSetpointResponse) {
            humiditySetting.dehumidifierSetpoint = response.dehumidificationSetpoint;
            humiditySetting.mode = response.on ? HumidityMode.Dehumidify : humiditySetting.mode;
            humiditySetting.activeMode = response.on ? HumidityMode.Dehumidify : humiditySetting.activeMode;
        }

        else if (response instanceof HumidificationSetpointResponse) {
            humiditySetting.humidifierSetpoint = response.humidificationSetpoint;
            humiditySetting.mode = response.on ? HumidityMode.Humidify : humiditySetting.mode;
            humiditySetting.activeMode = response.on ? HumidityMode.Humidify : humiditySetting.activeMode;
        }

        else if (response instanceof ThermostatInstallerSettingsResponse) {
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

        else if (response instanceof ServiceRemindersStatusResponse) {
            this.filterChangeIndication = response.airFilter;
            this.filterLifeLevel = response.airFilterPercent;

            this.console.info("air filter life: " + this.filterLifeLevel + "%, needs changing: " + this.filterChangeIndication);
        }

        else if (response instanceof ThermostatStatusResponse) {
            const heating = response.heating !== HeatingStatus.NotActive && response.heating !== HeatingStatus.EquipmentWait;
            const cooling = response.cooling !== CoolingStatus.NotActive && response.cooling !== CoolingStatus.EquipmentWait;

            if (heating)
                tempSettings.activeMode = ThermostatMode.Heat;
            else if (cooling)
                tempSettings.activeMode = ThermostatMode.Cool;
            else
                tempSettings.activeMode = ThermostatMode.Off;

            fanSettings.speed = response.fan;
            fanSettings.active = response.fan === TFanStatus.Active;

            this.console.info("status mode: " + tempSettings.activeMode + ", fan: " + response.fan);
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse) {
            switch (response.thermostat) {
                case ThermostatCapabilities.Cool:
                    tempSettings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Cool];
                    break;
                case ThermostatCapabilities.Heat:
                    tempSettings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat];
                    break;
                case ThermostatCapabilities.HeatAndCool:
                    tempSettings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool];
                    break;
                case ThermostatCapabilities.HeatCoolAndAuto:
                    tempSettings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool, ThermostatMode.Auto];
                    break;
                case ThermostatCapabilities.HeatEmergencyHeatAndCool:
                    tempSettings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool];
                    break;
                case ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto:
                    tempSettings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool, ThermostatMode.Auto];
                    break;
            }

            if (response.dehumidification)
                humiditySetting.availableModes.push(HumidityMode.Dehumidify);

            if (response.humidification !== HumidificationState.NotAvailable)
                humiditySetting.availableModes.push(HumidityMode.Humidify);

            this.console.info("thermostat modes: " + tempSettings.availableModes);
        }

        else if (response instanceof ThermostatSetpointAndModeSettingsResponse) {
            switch (response.mode) {
                case TMode.Auto:
                    this.on = true;
                    tempSettings.mode = ThermostatMode.Auto;
                    break;
                case TMode.Cool:
                    this.on = true;
                    tempSettings.mode = ThermostatMode.Cool;
                    break;
                case TMode.Heat:
                case TMode.EmergencyHeat:
                    this.on = true;
                    tempSettings.mode = ThermostatMode.Heat;
                    break;
                case TMode.Off:
                    this.on = false;
                    tempSettings.mode = ThermostatMode.FanOnly;
                    break;
            }

            switch (tempSettings.mode) {
                case ThermostatMode.Heat:
                    tempSettings.setpoint = response.heatSetpoint;
                    break;
                case ThermostatMode.Cool:
                    tempSettings.setpoint = response.coolSetpoint;
                    break;
                default:
                    tempSettings.setpoint = [Math.min(response.coolSetpoint, response.heatSetpoint), Math.max(response.coolSetpoint, response.heatSetpoint)];
                    break;
            }

            fanSettings.mode = response.fan === FanModeSetting.Auto ? FanMode.Auto : FanMode.Manual;

            this.console.info("thermostat mode: " + tempSettings.mode + ", setpoint: " + tempSettings.setpoint);
        }

        if (!tempSettings.activeMode)
            tempSettings.activeMode = tempSettings.mode;

        this.temperatureSetting = tempSettings;
        this.fan = fanSettings;
        this.humiditySetting = humiditySetting;

        super.processResponse(response);
    }
}