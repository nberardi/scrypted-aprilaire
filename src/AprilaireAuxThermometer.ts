import { ScryptedDeviceBase, TemperatureUnit, Thermometer } from '@scrypted/sdk';

/**
 * Auxiliary temperature sensor discovered from Sensors/Sensor Values (§5.1).
 * Display names are user-facing (e.g. "Return Air Temperature", "Supply Air Temperature",
 * "Remote Temperature"); nativeId suffixes remain |RAT / |LAT / |RemoteTemperature.
 */
export class AprilaireAuxThermometer extends ScryptedDeviceBase implements Thermometer {
    constructor(nativeId: string) {
        super(nativeId);
    }

    async setTemperatureUnit(temperatureUnit: TemperatureUnit): Promise<void> {
        this.temperatureUnit = temperatureUnit;
    }
}
