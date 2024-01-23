import { OnOff, ScryptedDeviceBase } from '@scrypted/sdk';


export class AprilaireHeatBlastSwitch extends ScryptedDeviceBase implements OnOff {
    constructor(nativeId: string) {
        super(nativeId);
    }

    turnOff(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    turnOn(): Promise<void> {
        throw new Error('Method not implemented.');
    }

}
