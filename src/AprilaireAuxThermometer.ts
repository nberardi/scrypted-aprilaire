import { ScryptedDeviceBase, TemperatureUnit, Thermometer } from '@scrypted/sdk';

/**
 * Auxiliary temperature sensor discovered when Sensor Values reports NoError.
 * Display names are user-facing (e.g. "Return Air Temperature", "Supply Air Temperature");
 * nativeId suffixes remain |RAT / |LAT for protocol identity.
 */
export class AprilaireAuxThermometer extends ScryptedDeviceBase implements Thermometer {
    constructor(nativeId: string) {
        super(nativeId);
    }

    async setTemperatureUnit(temperatureUnit: TemperatureUnit): Promise<void> {
        this.temperatureUnit = temperatureUnit;
    }
}
