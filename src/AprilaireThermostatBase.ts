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
        if (userInitiated)
            this.console.info("refresh", refreshInterface, userInitiated);

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
            try {
                this.console.group(
                    response instanceof SensorValuesResponse
                        ? "Sensor Values (§5.1)"
                        : "Controlling Sensors Status And Value"
                );

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
                else if (response.indoorHumidityStatus !== TemperatureSensorStatus.NotInstalled)
                    this.console.error("indoor humidity sensor error: " + response.indoorHumidityStatus);

                if (response.outdoorTemperatureStatus === TemperatureSensorStatus.NoError) {
                    this.console.info("outdoor temperature: " + response.outdoorTemperature + " C");
                } else if (response.outdoorTemperatureStatus !== TemperatureSensorStatus.NotInstalled)
                    this.console.error("outdoor temperature sensor error: " + response.outdoorTemperatureStatus);

                if (response.outdoorHumidityStatus === HumiditySensorStatus.NoError) {
                    this.console.info("outdoor humidity: " + response.outdoorHumidity + "%");
                } else if (response.outdoorHumidityStatus !== TemperatureSensorStatus.NotInstalled)
                    this.console.error("outdoor humidity sensor error: " + response.outdoorHumidityStatus);

                if (response instanceof SensorValuesResponse) {
                    if (response.returningAirTemperatureStatus === TemperatureSensorStatus.NoError) {
                        this.console.info("return air temperature: " + response.returningAirTemperature + " C");
                    } else if (response.returningAirTemperatureStatus !== TemperatureSensorStatus.NotInstalled) {
                        this.console.error("return air temperature sensor error: " + response.returningAirTemperatureStatus);
                    }

                    if (response.leavingAirTemperatureStatus === TemperatureSensorStatus.NoError) {
                        this.console.info("supply air temperature: " + response.leavingAirTemperature + " C");
                    } else if (response.leavingAirTemperatureStatus !== TemperatureSensorStatus.NotInstalled) {
                        this.console.error("supply air temperature sensor error: " + response.leavingAirTemperatureStatus);
                    }

                    if (response.outdoorWirelessTemperatureStatus === TemperatureSensorStatus.NoError) {
                        this.console.info("wireless outdoor temperature: " + response.outdoorWirelessTemperature + " C");
                    } else if (response.outdoorWirelessTemperatureStatus !== TemperatureSensorStatus.NotInstalled) {
                        this.console.error("wireless outdoor temperature sensor error: " + response.outdoorWirelessTemperatureStatus);
                    }
                }
            } finally {
                this.console.groupEnd();
            }
        } else if (response instanceof OfflineResponse) {
            this.online = response.offline === false;
        }
    }
}
