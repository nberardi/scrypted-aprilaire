import { OnOff } from '@scrypted/sdk';
import { AprilaireBase } from './AprilaireBase';


export class AprilaireAirCleaning extends AprilaireBase implements OnOff {
    turnOff(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    turnOn(): Promise<void> {
        throw new Error('Method not implemented.');
    }
}
