import { Fan, FanState, FilterMaintenance, HumidityCommand, HumidityMode, HumiditySensor, HumiditySetting, HumiditySettingStatus, OnOff } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { AprilaireSystemType, AprilaireThermostatBase } from './AprilaireThermostatBase';
import { DehumidificationSetpointRequest, DehumidificationSetpointResponse, ThermostatAndIAQAvailableResponse } from './FunctionalDomainControl';
import { DehumidificationStatus, IAQStatusResponse } from './FunctionalDomainStatus';
import { BasePayloadResponse } from './BasePayloadResponse';
import { ServiceRemindersStatusResponse } from './FunctionalDomainAlerts';


export class AprilaireDehumidifier extends AprilaireThermostatBase implements OnOff, Fan, HumiditySetting, HumiditySensor, FilterMaintenance {
    constructor(nativeId: string, client: AprilaireClient) {
        super(nativeId, client, AprilaireSystemType.Dehumidifier);
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
        let hrequest = new DehumidificationSetpointRequest();
        hrequest.on = false;
        this.client.write(hrequest);
    }

    async turnOn(): Promise<void> {
        let hrequest = new DehumidificationSetpointRequest();
        hrequest.on = true;
        hrequest.dehumidificationSetpoint = this.humiditySetting.humidifierSetpoint;
        this.client.write(hrequest);
    }

    async setHumidity(humidity: HumidityCommand): Promise<void> {
        let drequest = new DehumidificationSetpointRequest();

        if (humidity.dehumidifierSetpoint) {
            drequest.dehumidificationSetpoint = humidity.dehumidifierSetpoint;
        }

        if (humidity.mode) {
            switch (humidity.mode) {
                case HumidityMode.Off:
                    drequest.on = false;
                    break;

                case HumidityMode.Auto:
                    drequest.on = true;
                    break;

                case HumidityMode.Dehumidify:
                    drequest.on = true;
                    break;

                case HumidityMode.Humidify:
                    drequest.on = false;
                    break;
            }
        }

        this.client.write(drequest);
    }

    processResponse(response: BasePayloadResponse) {
        let humiditySetting: HumiditySettingStatus = JSON.parse(JSON.stringify(this.humiditySetting));

        if (response instanceof ServiceRemindersStatusResponse) {
            this.filterChangeIndication = response.dehumidifier;
            this.filterLifeLevel = response.dehumidifierPercent;

            this.console.info("dehumidifier filter life: " + this.filterLifeLevel + "%, needs changing: " + this.filterChangeIndication);
        }

        else if (response instanceof IAQStatusResponse) {
            const dehumidification = response.dehumidification === DehumidificationStatus.WholeHomeActive || response.dehumidification === DehumidificationStatus.OvercoolingToDehumidify;

            switch (response.dehumidification) {
                case DehumidificationStatus.Off:
                    humiditySetting.activeMode = HumidityMode.Off;
                    break;

                default:
                    humiditySetting.activeMode = HumidityMode.Dehumidify;
                    break;
            }
        }

        else if (response instanceof DehumidificationSetpointResponse) {
            humiditySetting.dehumidifierSetpoint = response.dehumidificationSetpoint;

            if (response.on)
                humiditySetting.mode = HumidityMode.Dehumidify;

            else
                humiditySetting.mode = HumidityMode.Off;
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse) {
            let modes: HumidityMode[] = [HumidityMode.Off];
            if (response.dehumidification)
                modes.push(HumidityMode.Humidify);

            humiditySetting.availableModes = modes;
            this.console.info("dehumidity modes: " + humiditySetting.availableModes);
        }

        if (!humiditySetting.activeMode)
            humiditySetting.activeMode = this.humiditySetting.mode;

        this.humiditySetting = humiditySetting;

        super.processResponse(response);
    }
}
