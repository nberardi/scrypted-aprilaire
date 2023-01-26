import { HumidityCommand, HumiditySensor, HumiditySetting, OnOff } from '@scrypted/sdk';
import { AprilaireBase } from './AprilaireBase';

export class AprilaireHumidityControl extends AprilaireBase implements OnOff, HumiditySetting, HumiditySensor {
    turnOff(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    turnOn(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    setHumidity(humidity: HumidityCommand): Promise<void> {
        throw new Error('Method not implemented.');
    }
}
