# scrypted-dyson

The Cloud Setup is recommend if this is your first time setting up Dyson. If you have previously setup Dyson with Homebridge the Homebridge Setup will be quicker to get up and running with your existing config file.

## Cloud Setup

1. Enter `Country Code`, `Email`, and `Password`
2. Click Save
3. Check your email for code.
4. Enter code from email into `Email Code`
5. Click Save

### FAQ's

#### How do I know when my setup is complete?

A value will appear in the `Token` field.  

#### No matter what I am trying, I am unable to get an email code. What is happening?

The Dyson API prevents multiple login's at the same time. However once the `Token` code has been retreived and `Local Password` has been downloaded for each device the cloud connection is no longer needed.  If you are running into trouble log out of your Dyson App, and wait for 15 minutes before clicking `Release Plugin`.  At that time you should receive a new email code. 

## Homebridge Setup

*This is recommended if you have previous setup the homebridge config, and already have the `ipAddress`, `serialNumber`, and `credentials` from the config file.*

1. Click `Add Device`
2. Copy the `ipAddress` and `credentials` from the config file into the setup screen.

### FAQ's

#### Why do you only need the `credentials`?

That is because all the information that is required is encoded into the `credentials` string in a base64 format. If you are curious you can take the credentials and paste it into [this website](https://www.base64decode.org) to see all the data contained in that string. 

## Manual Setup

1. Look up your `Product Type` before starting to add the device.
2. Click `Add Device`
3. Provide a `Name`, `IP Address`, `Serial Number`, and `Credentials` for your device.
4. Select the `Product Type` that you found in step 1.

### FAQ's

#### How do I find my `Product Type`?

To find your product type, you need to know your model of the device:

* Dyson Pure Humidify+Cool (PH01/PH02) is `358`
* Dyson Pure Humidify+Cool (PH03) is `358E`
* Dyson Pure Humidify+Cool Formaldehyde (PH04) is `358E`
* Dyson Pure Cool Link Tower (TP02) is `475`
* Dyson Pure Cool Tower (TP04/TP06) is `438`
* Dyson Pure Cool Tower (TP07/TP09) is `438E`
* Dyson Pure Hot+Cool Link (HP02) is `455`
* Dyson Pure Hot+Cool (HP04/HP06) is `527`
* Dyson Pure Hot+Cool Formaldehyde (HP07/HP09) is `527E`
* Dyson Pure Cool Link Desk (DP01) is `469`
* Dyson Pure Cool Desk (DP04) is `520`