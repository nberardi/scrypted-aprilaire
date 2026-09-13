import { HumidityMode, Online, ScryptedDeviceBase, FanMode, Refresh, ThermostatMode } from '@scrypted/sdk';
import { AprilaireClient } from './AprilaireClient';
import { BasePayloadResponse, ResponseErrorType } from "./BasePayloadResponse";
import { ControllingSensorsStatusAndValueResponse, TemperatureSensorStatus, HumiditySensorStatus, SensorValuesRequest, SensorValuesResponse } from './FunctionalDomainSensors';
import { OfflineResponse, ThermostatStatusRequest } from './FunctionalDomainStatus';

export enum AprilaireSystemType {
    Thermostat,
    Humidifier,
    Dehumidifier,
}

export class AprilaireThermostatBase extends ScryptedDeviceBase implements Online, Refresh {
    constructor(nativeId: string, public client: AprilaireClient, public systemType: AprilaireSystemType) {
        super(nativeId);

        this.humiditySetting = {
            mode: HumidityMode.Off,
            availableModes: [HumidityMode.Off]
        };

        this.temperatureSetting = {
            mode: ThermostatMode.Off,
            activeMode: ThermostatMode.Off,
            availableModes: [ThermostatMode.Off],
            setpoint: 0,
        };

        this.fan = {
            speed: 0,
            availableModes: [FanMode.Auto, FanMode.Manual]
        };

        this.online = true;
        this.client.on("connected", () => { this.online = true; });
        this.client.on("disconnected", () => { this.online = false; });

        this.processResponse(client.system);
        this.client.on("response", this.processResponse.bind(this));
    }

    async getRefreshFrequency(): Promise<number> {
        return 300;
    }

    async refresh(refreshInterface: string, userInitiated: boolean): Promise<void> {
        if (refreshInterface === "Thermometer" || refreshInterface === "HumiditySensor") {
            this.client.read(new SensorValuesRequest());
            return;
        }
        if (userInitiated && refreshInterface === "TemperatureSetting") {
            this.client.read(new ThermostatStatusRequest());
        }
    }

    /** Truncated payloads must not publish default/fabricated state. */
    protected isUsableResponse(response: BasePayloadResponse): boolean {
        if (!response)
            return false;

        if (response.responseError !== ResponseErrorType.NoError) {
            this.console.warn(
                `discarding ${response.constructor.name}: ${ResponseErrorType[response.responseError] ?? response.responseError}`
            );
            return false;
        }

        return true;
    }

    processResponse(response: BasePayloadResponse) {
        if (!this.isUsableResponse(response))
            return;

        if (response instanceof ControllingSensorsStatusAndValueResponse || response instanceof SensorValuesResponse) {
            if (response.indoorTemperatureStatus === TemperatureSensorStatus.NoError)
                this.temperature = response.indoorTemperature;
            if (response.indoorHumidityStatus === HumiditySensorStatus.NoError)
                this.humidity = response.indoorHumidity;
        } else if (response instanceof OfflineResponse) {
            this.online = response.offline === false;
        }
    }
}
