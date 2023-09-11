import { ScryptedDeviceBase, TemperatureUnit, Thermometer } from '@scrypted/sdk';


export class AprilaireOutdoorThermometer extends ScryptedDeviceBase implements Thermometer {
    constructor(nativeId: string) {
        super(nativeId);
    }

    async setTemperatureUnit(temperatureUnit: TemperatureUnit): Promise<void> {
        this.temperatureUnit = temperatureUnit;
    }
}
