import { HumiditySensor, ScryptedDeviceBase, TemperatureUnit, Thermometer } from '@scrypted/sdk';

/**
 * Outdoor temperature (and optional humidity) child device for a thermostat MAC.
 * Humidity is set when wireless/controlling outdoor humidity status is NoError.
 */
export class AprilaireOutdoorThermometer extends ScryptedDeviceBase implements Thermometer, HumiditySensor {
    constructor(nativeId: string) {
        super(nativeId);
    }

    async setTemperatureUnit(temperatureUnit: TemperatureUnit): Promise<void> {
        this.temperatureUnit = temperatureUnit;
    }
}
