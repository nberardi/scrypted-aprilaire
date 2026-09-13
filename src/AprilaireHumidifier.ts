import { Fan, FanState, FilterMaintenance, HumidityCommand, HumidityMode, HumiditySensor, HumiditySetting, HumiditySettingStatus, OnOff } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { AprilaireSystemType, AprilaireThermostatBase } from './AprilaireThermostatBase';
import { HumidificationSetpointRequest, HumidificationSetpointResponse, HumidificationState, ThermostatAndIAQAvailableResponse } from './FunctionalDomainControl';
import { DehumidificationStatus, HumidificationStatus, IAQStatusResponse } from './FunctionalDomainStatus';
import { BasePayloadResponse } from './BasePayloadResponse';
import { ServiceRemindersStatusResponse } from './FunctionalDomainAlerts';

export class AprilaireHumidifier extends AprilaireThermostatBase implements OnOff, Fan, HumiditySetting, HumiditySensor, FilterMaintenance {
    /** Last Auto window index (1–7). Not a %RH value. */
    private _autoLevel?: number;

    constructor(nativeId: string, client: AprilaireClient) {
        super(nativeId, client, AprilaireSystemType.Humidifier);
    }

    async setFan(fan: FanState): Promise<void> {
        if (fan.speed === undefined)
            return;
        if (fan.speed === 0)
            return this.turnOff();
        return this.turnOn();
    }

    /**
     * Auto humidification (§2.4) uses the 1–7 setpoint window instead of
     * 10–50 %RH, so every write has to declare which window it is using.
     */
    private buildSetpointRequest(): HumidificationSetpointRequest {
        const request = new HumidificationSetpointRequest();
        request.auto = this.client.system?.humidification === HumidificationState.Auto;
        request.autoLevel = this._autoLevel;
        return request;
    }

    async turnOff(): Promise<void> {
        // On/fan follow COS — do not publish Off until the thermostat confirms.
        const hrequest = this.buildSetpointRequest();
        hrequest.on = false;
        this.client.write(hrequest);
    }

    async turnOn(): Promise<void> {
        const hrequest = this.buildSetpointRequest();
        hrequest.on = true;
        hrequest.humidificationSetpoint = this.humiditySetting?.humidifierSetpoint ?? 0;
        hrequest.autoLevel = this._autoLevel;
        this.client.write(hrequest);
    }

    async setHumidity(humidity: HumidityCommand): Promise<void> {
        const hrequest = this.buildSetpointRequest();

        if (humidity.humidifierSetpoint !== undefined)
            hrequest.humidificationSetpoint = humidity.humidifierSetpoint;
        else
            hrequest.humidificationSetpoint = this.humiditySetting?.humidifierSetpoint ?? 0;

        if (humidity.mode) {
            switch (humidity.mode) {
                case HumidityMode.Auto:
                case HumidityMode.Humidify:
                    hrequest.on = true;
                    break;

                default:
                    hrequest.on = false;
                    break;
            }
        } else {
            // Setpoint-only change: keep the current on/off state. The wire
            // encodes off as setpoint 0, so leaving `on` unset would turn the
            // unit off when the user only moves the humidity slider.
            hrequest.on = this.humiditySetting?.mode === HumidityMode.Humidify
                || this.humiditySetting?.mode === HumidityMode.Auto;
        }

        this.client.write(hrequest);
    }

    processResponse(response: BasePayloadResponse) {
        if (!this.isUsableResponse(response))
            return;

        const humiditySetting: HumiditySettingStatus = JSON.parse(JSON.stringify(this.humiditySetting));

        if (response instanceof ServiceRemindersStatusResponse) {
            this.filterChangeIndication = response.waterPanel;
            this.filterLifeLevel = response.waterPanelPercent;

            this.console.info("water panel filter life: " + this.filterLifeLevel + "%, needs changing: " + this.filterChangeIndication);
        }

        else if (response instanceof IAQStatusResponse) {
            switch (response.humidification) {
                case HumidificationStatus.Off:
                case HumidificationStatus.NotActive:
                case HumidificationStatus.EquipmentWait:
                    humiditySetting.activeMode = HumidityMode.Off;
                    break;

                default:
                    humiditySetting.activeMode = this.client.system?.humidification === HumidificationState.Auto
                        ? HumidityMode.Auto
                        : HumidityMode.Humidify;
                    break;
            }
        }

        else if (response instanceof HumidificationSetpointResponse) {
            if (response.window === "auto") {
                this._autoLevel = response.autoLevel;
                humiditySetting.mode = HumidityMode.Auto;
                // 1–7 is an index, not %RH — do not publish it as humidifierSetpoint.
            } else if (response.window === "manual") {
                humiditySetting.humidifierSetpoint = response.humidificationSetpoint;
                humiditySetting.mode = HumidityMode.Humidify;
            } else {
                humiditySetting.mode = HumidityMode.Off;
            }

            this.on = response.on;
            this.fan = { speed: response.on ? 1 : 0 };
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse) {
            const modes: HumidityMode[] = [HumidityMode.Off];
            if (response.humidification === HumidificationState.Auto)
                modes.push(HumidityMode.Auto);
            else if (response.humidification === HumidificationState.Manual)
                modes.push(HumidityMode.Humidify);

            humiditySetting.availableModes = modes;
            this.console.info("humidity modes: " + humiditySetting.availableModes);
        }

        if (!humiditySetting.activeMode)
            humiditySetting.activeMode = this.humiditySetting.mode;

        this.humiditySetting = humiditySetting;

        super.processResponse(response);
    }
}
