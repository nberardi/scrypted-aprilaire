import { Fan, FanMode, FanState, FanStatus, FilterMaintenance, HumidityCommand, HumidityMode, HumiditySensor, HumiditySetting, OnOff, Setting, SettingValue, Settings, TemperatureCommand, TemperatureSetting, TemperatureUnit, Thermometer, ThermostatMode } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { AprilaireSystemType, AprilaireThermostatBase } from './AprilaireThermostatBase';
import { DehumidificationSetpointResponse, FanModeSetting, HumidificationSetpointResponse, HumidificationState, ThermostatAndIAQAvailableResponse, ThermostatCapabilities, ThermostatSetpointAndModeSettingsRequest, ThermostatSetpointAndModeSettingsResponse, ThermostatMode as TMode, enforceDeadband, DeadbandPreserve } from './FunctionalDomainControl';
import {
    DEFAULT_DEADBAND_C,
    deadbandIndexToCelsius,
    filterHoldChoicesForInstaller,
    ScaleRequest,
    ScaleResponse,
    shouldShowHeatBlastSetting,
    TemperatureScale,
    ThermostatInstallerSettingsResponse,
} from './FunctionalDomainSetup';
import { buildScheduleHoldRequest, HeatBlastRequest, HeatBlastResponse, holdTypeToUiValue, HOLD_UI, ScheduleHoldResponse } from './FunctionalDomainScheduling';
import { CoolingStatus, FanStatus as TFanStatus, HeatingStatus, ThermostatStatusResponse } from './FunctionalDomainStatus';
import { BasePayloadResponse } from './BasePayloadResponse';
import { ServiceRemindersStatusResponse } from './FunctionalDomainAlerts';
import { StorageSettingsDevice, StorageSettings } from '@scrypted/sdk/storage-settings';

export class AprilaireThermostat extends AprilaireThermostatBase implements OnOff, Settings, StorageSettingsDevice, TemperatureSetting, Thermometer, HumiditySensor, HumiditySetting, FilterMaintenance, Fan {
    private _heatBlastState: boolean;
    private _holdState: string;
    /**
     * Last Setup/1 installer settings (scale, deadband, Away/Heat Blast enables, etc.).
     * Undefined until COS/Sync or an explicit read delivers ThermostatInstallerSettingsResponse.
     */
    private _installerSettings?: ThermostatInstallerSettingsResponse;
    /**
     * Deadband separation in °C from Installer Settings §1.1 byte 13.
     * Default 1.5°C (3°F) until a ThermostatInstallerSettingsResponse arrives.
     */
    private _deadbandC: number = DEFAULT_DEADBAND_C;

    readonly deviceOn = "On";
    readonly deviceOff = "Off";
    readonly holdSchedule = HOLD_UI.Schedule;
    readonly holdTemporary = HOLD_UI.Temporary;
    readonly holdPermanent = HOLD_UI.Permanent;
    readonly holdAway = HOLD_UI.Away;
    readonly holdVacation = HOLD_UI.Vacation;

    /** Default Temporary hold duration when no end date is supplied by the UI. */
    static readonly DEFAULT_TEMPORARY_HOLD_MS = 4 * 60 * 60 * 1000;
    /** Default Vacation end when no return date is supplied by the UI. */
    static readonly DEFAULT_VACATION_HOLD_MS = 7 * 24 * 60 * 60 * 1000;

    /** All hold choices; Away is filtered out when installer Away is disabled. */
    readonly holdChoices = ["Schedule", "Temporary", "Permanent", "Away", "Vacation"] as const;

    /**
     * Deadband raw enum from installer settings (byte 13). Stable name for #15.
     * Undefined until installer settings are received.
     */
    deadband?: number;

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
            choices: [HOLD_UI.Schedule, HOLD_UI.Temporary, HOLD_UI.Permanent, HOLD_UI.Away, HOLD_UI.Vacation],
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
        // Explicit mode wins; otherwise infer from speed (>0 = manual/on, 0 = auto).
        let mode: FanMode;
        if (fan.mode !== undefined)
            mode = fan.mode === FanMode.Auto ? FanMode.Auto : FanMode.Manual;
        else if (fan.speed !== undefined)
            mode = fan.speed > 0 ? FanMode.Manual : FanMode.Auto;
        else
            return;

        var setting = {...this.fan};
        setting.mode = mode;
        // Manual = fan forced on; in Auto the ThermostatStatus COS reports actual state.
        setting.speed = mode === FanMode.Manual ? 1 : 0;
        setting.active = mode === FanMode.Manual;

        let request = new ThermostatSetpointAndModeSettingsRequest();
        request.fan = mode === FanMode.Auto ? FanModeSetting.Auto : FanModeSetting.On;

        this.fan = setting;
        this.client.write(request);
    }

    async getSettings(): Promise<Setting[]> {
        const s = await this.storageSettings.getSettings();

        // Gate Heat Blast / Away from installer Setup/1 enables (defaults: hide until known).
        const heatBlastEnabled = this._installerSettings?.heatBlastEnabled;
        const awayEnabled = this._installerSettings?.awayEnabled === true;
        const showHeatBlast = shouldShowHeatBlastSetting(heatBlastEnabled);

        const settings: Setting[] = [];
        for (const setting of s) {
            if (setting.key?.startsWith("heatBlast")) {
                if (!showHeatBlast)
                    continue;
                settings.push(setting);
                continue;
            }

            if (setting.key?.startsWith("hold")) {
                const choices = filterHoldChoicesForInstaller(
                    setting.choices ?? [...this.holdChoices],
                    awayEnabled,
                    this.holdAway
                );
                settings.push({ ...setting, choices });
                continue;
            }

            settings.push(setting);
        }

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

        const uiValue = String(newValue);
        const { heatSetpoint, coolSetpoint } = this.currentHoldSetpoints();
        const fan = this.currentFanModeSetting();
        const dehumidifierSetpoint = this.humiditySetting?.dehumidifierSetpoint;

        let endDate: Date | undefined;
        if (uiValue === this.holdTemporary) {
            endDate = new Date(Date.now() + AprilaireThermostat.DEFAULT_TEMPORARY_HOLD_MS);
        } else if (uiValue === this.holdVacation) {
            endDate = new Date(Date.now() + AprilaireThermostat.DEFAULT_VACATION_HOLD_MS);
        }

        const request = buildScheduleHoldRequest(uiValue, {
            fan,
            heatSetpoint,
            coolSetpoint,
            dehumidifierSetpoint,
            endDate,
        });

        this.client.write(request);
        this._holdState = uiValue;
        this.storageSettings.values.hold = uiValue;
    }

    /**
     * Resolve current heat/cool setpoints from Scrypted temperatureSetting
     * (single number or [low, high] pair) for hold writes.
     */
    private currentHoldSetpoints(): { heatSetpoint?: number; coolSetpoint?: number } {
        const setpoint = this.temperatureSetting?.setpoint;
        if (setpoint === undefined || setpoint === null) {
            return {};
        }
        if (typeof setpoint === "number") {
            switch (this.temperatureSetting?.mode) {
                case ThermostatMode.Cool:
                    return { coolSetpoint: setpoint };
                case ThermostatMode.Heat:
                default:
                    return { heatSetpoint: setpoint };
            }
        }
        const low = Math.min(setpoint[0], setpoint[1]);
        const high = Math.max(setpoint[0], setpoint[1]);
        return { heatSetpoint: low, coolSetpoint: high };
    }

    private currentFanModeSetting(): FanModeSetting {
        if (this.fan?.mode === FanMode.Auto)
            return FanModeSetting.Auto;
        if (this.fan?.mode === FanMode.Manual)
            return FanModeSetting.On;
        return FanModeSetting.Null;
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

        // In Auto, dual heat+cool writes that violate deadband NACK or surprise-adjust
        // on the thermostat (§J.6 / §2.1). Pre-enforce so the wire values stay valid.
        this.applyDeadbandToRequest(request, settings.mode);

        // Reflect any deadband adjustment back into Scrypted state.
        if (request.heatSetpoint && request.coolSetpoint) {
            const effectiveMode = mode ?? settings.mode;
            if (
                effectiveMode === ThermostatMode.Auto ||
                effectiveMode === ThermostatMode.HeatCool ||
                effectiveMode === ThermostatMode.On
            ) {
                settings.setpoint = [
                    Math.min(request.heatSetpoint, request.coolSetpoint),
                    Math.max(request.heatSetpoint, request.coolSetpoint),
                ];
            }
        }

        this.temperatureSetting = settings;

        this.client.write(request);
    }

    /**
     * When both heat and cool setpoints are present on a write (or can be inferred
     * from current Auto dual-setpoint state), ensure cool − heat ≥ deadband.
     *
     * Preserve policy: keep the setpoint the user is changing; adjust the opposing
     * one. If both change (or both are newly written), preserve heat and raise cool.
     */
    private applyDeadbandToRequest(
        request: ThermostatSetpointAndModeSettingsRequest,
        effectiveMode: ThermostatMode | undefined
    ): void {
        const isAuto =
            effectiveMode === ThermostatMode.Auto ||
            effectiveMode === ThermostatMode.HeatCool ||
            effectiveMode === ThermostatMode.On ||
            request.mode === TMode.Auto;

        if (!isAuto) {
            return;
        }

        const current = this.currentHeatCoolSetpoints();
        const heatWritten = Boolean(request.heatSetpoint);
        const coolWritten = Boolean(request.coolSetpoint);

        // Nothing to enforce unless at least one setpoint is being written.
        if (!heatWritten && !coolWritten) {
            return;
        }

        // Resolve both sides: written value takes precedence, else current Auto pair.
        let heat = heatWritten ? request.heatSetpoint : current.heat;
        let cool = coolWritten ? request.coolSetpoint : current.cool;
        if (!heat || !cool) {
            // Opposing setpoint unknown — cannot evaluate separation client-side.
            return;
        }

        // Put both sides on the wire so the thermostat does not surprise-adjust.
        request.heatSetpoint = heat;
        request.coolSetpoint = cool;

        let preserve: DeadbandPreserve = "both";
        if (heatWritten && !coolWritten) {
            preserve = "heat";
        } else if (coolWritten && !heatWritten) {
            preserve = "cool";
        } else if (heatWritten && coolWritten && current.heat && current.cool) {
            const heatChanged = heat !== current.heat;
            const coolChanged = cool !== current.cool;
            if (heatChanged && !coolChanged) {
                preserve = "heat";
            } else if (coolChanged && !heatChanged) {
                preserve = "cool";
            }
        }

        const result = enforceDeadband(heat, cool, this._deadbandC, preserve);
        if (result.adjusted) {
            this.console.info(
                `deadband ${this._deadbandC}°C: adjusted setpoints heat ${heat}→${result.heatSetpoint}, cool ${cool}→${result.coolSetpoint} (preserve=${preserve})`
            );
        }
        request.heatSetpoint = result.heatSetpoint;
        request.coolSetpoint = result.coolSetpoint;
    }

    /** Best-effort current heat/cool from temperatureSetting (protocol °C). */
    private currentHeatCoolSetpoints(): { heat: number; cool: number } {
        const sp = this.temperatureSetting?.setpoint;
        if (Array.isArray(sp) && sp.length >= 2) {
            return {
                heat: Math.min(sp[0], sp[1]),
                cool: Math.max(sp[0], sp[1]),
            };
        }
        if (typeof sp === "number") {
            if (this.temperatureSetting?.mode === ThermostatMode.Heat) {
                return { heat: sp, cool: 0 };
            }
            if (this.temperatureSetting?.mode === ThermostatMode.Cool) {
                return { heat: 0, cool: sp };
            }
        }
        return { heat: 0, cool: 0 };
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
            this._installerSettings = response;
            this.deadband = response.deadband;
            this._deadbandC = deadbandIndexToCelsius(response.deadband);
            this.temperatureUnit = response.scale === TemperatureScale.F ? TemperatureUnit.F : TemperatureUnit.C;
            this.console.info(
                `installer settings: scale=${response.scale}, deadband=${response.deadband} (${this._deadbandC}C), ` +
                `away=${response.awayEnabled}, heatBlast=${response.heatBlastEnabled}, outdoor=${response.outdoorSensor}, ` +
                `hvacReminder=${response.hvacServiceReminderMonths}`
            );
        }

        else if (response instanceof HeatBlastResponse) {
            this._heatBlastState = this._heatBlastState ?? response.heatBlast;
            this.storageSettings.values.heatBlast = this._heatBlastState;
        }

        else if (response instanceof ScheduleHoldResponse) {
            // Keep Settings UI in sync with COS / read responses
            this._holdState = holdTypeToUiValue(response.hold);
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