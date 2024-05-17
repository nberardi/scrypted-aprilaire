import { Fan, FanMode, FanState, FanStatus, FilterMaintenance, HumiditySensor, OnOff, Setting, SettingValue, Settings, TemperatureCommand, TemperatureSetting, TemperatureUnit, Thermometer, ThermostatMode } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { AprilaireSystemType, AprilaireThermostatBase } from './AprilaireThermostatBase';
import { FanModeSetting, ThermostatAndIAQAvailableResponse, ThermostatCapabilities, ThermostatSetpointAndModeSettingsRequest, ThermostatSetpointAndModeSettingsResponse, ThermostatMode as TMode} from './FunctionalDomainControl';
import { ScaleRequest, ScaleResponse, TemperatureScale, ThermostatInstallerSettingsResponse } from './FunctionalDomainSetup';
import { HeatBlastRequest, HeatBlastResponse, HoldType, ScheduleHoldResponse } from './FunctionalDomainScheduling';
import { CoolingStatus, HeatingStatus, ThermostatStatusResponse } from './FunctionalDomainStatus';
import { BasePayloadResponse } from './BasePayloadResponse';
import { ServiceRemindersStatusResponse } from './FunctionalDomainAlerts';
import { StorageSettingsDevice, StorageSettings } from '@scrypted/sdk/storage-settings';

export class AprilaireThermostat extends AprilaireThermostatBase implements OnOff, Settings, StorageSettingsDevice, TemperatureSetting, Thermometer, HumiditySensor, FilterMaintenance, Fan {
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
    }

    async setFan(fan: FanState): Promise<void> {
        let request = new ThermostatSetpointAndModeSettingsRequest();
        request.fan = fan.mode === FanMode.Auto ? FanModeSetting.Auto : FanModeSetting.On;
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

        var settings = { ...this.temperatureSetting };

        if (response instanceof ScaleResponse) {
            this.temperatureUnit = response.scale === TemperatureScale.F ? TemperatureUnit.F : TemperatureUnit.C;
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
                settings.activeMode = ThermostatMode.Heat;
            else if (cooling)
                settings.activeMode = ThermostatMode.Cool;
            else
            settings.activeMode = ThermostatMode.Off;

            fan.speed = response.fan;
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse) {
            switch (response.thermostat) {
                case ThermostatCapabilities.Cool:
                    settings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Cool];
                    break;
                case ThermostatCapabilities.Heat:
                    settings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat];
                    break;
                case ThermostatCapabilities.HeatAndCool:
                    settings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool];
                    break;
                case ThermostatCapabilities.HeatCoolAndAuto:
                    settings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool, ThermostatMode.Auto];
                    break;
                case ThermostatCapabilities.HeatEmergencyHeatAndCool:
                    settings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool];
                    break;
                case ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto:
                    settings.availableModes = [ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool, ThermostatMode.Auto];
                    break;
            }

            this.console.info("thermostat modes: " + settings.availableModes);
        }

        else if (response instanceof ThermostatSetpointAndModeSettingsResponse) {
            switch (response.mode) {
                case TMode.Auto:
                    this.on = true;
                    settings.mode = ThermostatMode.Auto;
                    break;
                case TMode.Cool:
                    this.on = true;
                    settings.mode = ThermostatMode.Cool;
                    break;
                case TMode.Heat:
                case TMode.EmergencyHeat:
                    this.on = true;
                    settings.mode = ThermostatMode.Heat;
                    break;
                case TMode.Off:
                    this.on = false;
                    settings.mode = ThermostatMode.FanOnly;
                    break;
            }

            switch (settings.mode) {
                case ThermostatMode.Heat:
                    settings.setpoint = response.heatSetpoint;
                    break;
                case ThermostatMode.Cool:
                    settings.setpoint = response.coolSetpoint;
                    break;
                default:
                    settings.setpoint = [Math.min(response.coolSetpoint, response.heatSetpoint), Math.max(response.coolSetpoint, response.heatSetpoint)];
                    break;
            }

            fan.mode = response.fan === FanModeSetting.Auto ? FanMode.Auto : FanMode.Manual;

            this.console.info("thermostat mode: " + settings.mode + ", setpoint: " + settings.setpoint);
        }

        if (!settings.activeMode)
            settings.activeMode = settings.mode;

        this.fan = fan;
        this.temperatureSetting = settings;

        super.processResponse(response);
    }
}