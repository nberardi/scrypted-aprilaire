import { Fan, FanState, FilterMaintenance, HumidityCommand, HumidityMode, HumiditySensor, HumiditySetting, HumiditySettingStatus, OnOff } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { AprilaireSystemType, AprilaireThermostatBase } from './AprilaireThermostatBase';
import { HumidificationSetpointRequest, HumidificationSetpointResponse, ThermostatAndIAQAvailableResponse } from './FunctionalDomainControl';
import { DehumidificationStatus, IAQStatusResponse } from './FunctionalDomainStatus';
import { BasePayloadResponse } from './BasePayloadResponse';
import { ServiceRemindersStatusResponse } from './FunctionalDomainAlerts';

export class AprilaireHumidifier extends AprilaireThermostatBase implements OnOff, Fan, HumiditySetting, HumiditySensor, FilterMaintenance {
    constructor(nativeId: string, client: AprilaireClient) {
        super(nativeId, client, AprilaireSystemType.Humidifier);
    }

    setFan(fan: FanState): Promise<void> {
        if (fan.speed) {
            if (fan.speed === 0)
                return this.turnOff();
            else
                return this.turnOn();
        }
    }

    async turnOff(): Promise<void> {
        this.on = false;
        this.fan = { speed: 0 };

        let hrequest = new HumidificationSetpointRequest();
        hrequest.on = false;
        this.client.write(hrequest);
    }

    async turnOn(): Promise<void> {
        this.on = true;
        this.fan = { speed: 1 };

        let hrequest = new HumidificationSetpointRequest();
        hrequest.on = true;
        hrequest.humidificationSetpoint = this.humiditySetting.humidifierSetpoint;
        this.client.write(hrequest);
    }

    async setHumidity(humidity: HumidityCommand): Promise<void> {
        let hrequest = new HumidificationSetpointRequest();

        if (humidity.humidifierSetpoint) {
            hrequest.humidificationSetpoint = humidity.humidifierSetpoint;
        }

        if (humidity.mode) {
            switch (humidity.mode) {
                case HumidityMode.Off:
                    hrequest.on = false;
                    break;

                case HumidityMode.Auto:
                    hrequest.on = true;
                    break;

                case HumidityMode.Dehumidify:
                    hrequest.on = false;
                    break;

                case HumidityMode.Humidify:
                    hrequest.on = true;
                    break;
            }
        }

        this.client.write(hrequest);
    }

    processResponse(response: BasePayloadResponse) {
        let humiditySetting: HumiditySettingStatus = JSON.parse(JSON.stringify(this.humiditySetting));

        if (response instanceof ServiceRemindersStatusResponse) {
            this.filterChangeIndication = response.waterPanel;
            this.filterLifeLevel = response.waterPanelPercent;

            this.console.info("water panel filter life: " + this.filterLifeLevel + "%, needs changing: " + this.filterChangeIndication);
        }

        else if (response instanceof IAQStatusResponse) {
            const dehumidification = response.dehumidification === DehumidificationStatus.WholeHomeActive || response.dehumidification === DehumidificationStatus.OvercoolingToDehumidify;

            switch (response.dehumidification) {
                case DehumidificationStatus.Off:
                    humiditySetting.activeMode = HumidityMode.Off;
                    break;

                default:
                    humiditySetting.activeMode = HumidityMode.Humidify;
                    break;
            }
        }

        else if (response instanceof HumidificationSetpointResponse) {
            humiditySetting.humidifierSetpoint = response.humidificationSetpoint;

            if (response.on)
                humiditySetting.mode = HumidityMode.Humidify;

            else
                humiditySetting.mode = HumidityMode.Off;
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse) {
            let modes: HumidityMode[] = [HumidityMode.Off];
            if (response.humidification)
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
