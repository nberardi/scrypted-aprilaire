import { FanState, OnOff } from '@scrypted/sdk';
import { AprilaireBase } from './AprilaireBase';


export class AprilaireFreshAir extends AprilaireBase implements OnOff {
    turnOff(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    turnOn(): Promise<void> {
        throw new Error('Method not implemented.');
    }
}


