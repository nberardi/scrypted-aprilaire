import { HumiditySensor, OnOff, TemperatureSetting, TemperatureUnit, Thermometer, ThermostatMode } from '@scrypted/sdk';
import { AprilaireBase } from './AprilaireBase';
import { AprilaireClient } from './AprilaireClient';
import { BasePayloadResponse, ControllingSensorsStatusAndValueResponse, HumiditySensorStatus, TemperatureSensorStatus, ThermostatAndIAQAvailableResponse, ThermostatCapabilities, ThermostatSetpointAndModeSettingsResponse, ThermostatMode as TMode } from './payloads';
import { tmpdir } from 'os';

export class AprilaireThermostat extends AprilaireBase implements OnOff, TemperatureSetting, Thermometer, HumiditySensor {
    client: AprilaireClient;

    last = new Map<string, BasePayloadResponse>();

    constructor(nativeId: string, client: AprilaireClient) {
        super(nativeId);

        const self = this;

        this.client = client;
        this.client.on("response", (response: BasePayloadResponse) => {
            self.processResponse(response);
        });
    }

    refresh() {
        this.client.requestThermostatIAQAvailable();
        this.client.requestThermostatSetpointAndModeSettings();
    }

    private processResponse(response: BasePayloadResponse) {
        this.last.set(response.constructor.name, response);

        if (response instanceof ControllingSensorsStatusAndValueResponse) {
            if (response.indoorTemperatureStatus === TemperatureSensorStatus.NoError)
                this.temperature = response.indoorTemperature;

            if (response.indoorHumidityStatus === HumiditySensorStatus.NoError)
                this.humidity = response.indoorHumidity;
        }

        else if (response instanceof ThermostatAndIAQAvailableResponse) {
            switch(response.thermostat) {
                case ThermostatCapabilities.Cool:
                    this.thermostatAvailableModes = [ThermostatMode.Off, ThermostatMode.FanOnly, ThermostatMode.Cool];
                    break;
                case ThermostatCapabilities.Heat:
                    this.thermostatAvailableModes = [ThermostatMode.Off, ThermostatMode.FanOnly, ThermostatMode.Heat];
                    break;
                case ThermostatCapabilities.HeatAndCool: 
                    this.thermostatAvailableModes = [ThermostatMode.Off, ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool];
                    break;
                case ThermostatCapabilities.HeatCoolAndAuto:
                    this.thermostatAvailableModes = [ThermostatMode.Off, ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool, ThermostatMode.Auto];
                    break;
                case ThermostatCapabilities.HeatEmergencyHeatAndCool:
                    this.thermostatAvailableModes = [ThermostatMode.Off, ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool];
                    break;
                case ThermostatCapabilities.HeatEmergencyHeatCoolAndAuto:
                    this.thermostatAvailableModes = [ThermostatMode.Off, ThermostatMode.FanOnly, ThermostatMode.Heat, ThermostatMode.Cool, ThermostatMode.HeatCool, ThermostatMode.Auto];
                    break;
            }
        }

        else if (response instanceof ThermostatSetpointAndModeSettingsResponse) {
            switch(response.mode) {
                case TMode.Auto: 
                    this.thermostatActiveMode = ThermostatMode.Auto;
                    break;
                case TMode.Cool:
                    this.thermostatActiveMode = ThermostatMode.Cool;
                    break;
                case TMode.Heat:
                    this.thermostatActiveMode = ThermostatMode.Heat;
                    break;
                case TMode.EmergencyHeat:
                    this.thermostatActiveMode = ThermostatMode.Heat;
                    break;
                case TMode.Off:
                    this.thermostatActiveMode = ThermostatMode.Off;
                    break;
            }

            switch(this.thermostatActiveMode) {
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
        }
    }

    turnOff(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    turnOn(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    setTemperatureUnit(temperatureUnit: TemperatureUnit): Promise<void> {
        throw new Error('Method not implemented.');
    }
    setThermostatMode(mode: ThermostatMode): Promise<void> {
        throw new Error('Method not implemented.');
    }
    setThermostatSetpoint(degrees: number): Promise<void> {
        throw new Error('Method not implemented.');
    }
    setThermostatSetpointHigh(high: number): Promise<void> {
        throw new Error('Method not implemented.');
    }
    setThermostatSetpointLow(low: number): Promise<void> {
        throw new Error('Method not implemented.');
    }
}
