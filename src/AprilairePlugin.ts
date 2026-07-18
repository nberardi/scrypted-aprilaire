import sdk, { Device, DeviceBase, DeviceCreator, DeviceCreatorSettings, ScryptedDevice, ScryptedDeviceType, ScryptedInterface, SettingValue, TemperatureUnit, Thermometer } from '@scrypted/sdk';
import { DeviceProvider, ScryptedDeviceBase, Setting, Settings } from '@scrypted/sdk';
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import { AprilaireClient } from './AprilaireClient';
import { BasePayloadResponse } from "./BasePayloadResponse";
import {
    ControllingSensorsStatusAndValueRequest,
    ControllingSensorsStatusAndValueResponse,
    HumiditySensorStatus,
    SensorValuesRequest,
    SensorValuesResponse,
    TemperatureSensorStatus,
    WrittenOutdoorTemperatureValueRequest,
} from './FunctionalDomainSensors';
import { ThermostatInstallerSettingsRequest, ThermostatInstallerSettingsResponse, OutdoorSensorStatus } from './FunctionalDomainSetup';
import { HeatBlastResponse, HoldType, ScheduleHoldRequest, ScheduleHoldResponse } from './FunctionalDomainScheduling';
import { SyncRequest } from './FunctionalDomainStatus';
import { setInterval } from 'node:timers';
import { AprilaireOutdoorThermometer } from './AprilaireOutdoorThermometer';
import { AprilaireAuxThermometer } from './AprilaireAuxThermometer';
import { AprilaireThermostat } from './AprilaireThermostat';
import { AprilaireDehumidifier } from './AprilaireDehumidifier';
import { AprilaireHumidifier } from './AprilaireHumidifier';

const { deviceManager, systemManager } = sdk;

/** Stable nativeId suffixes (internal; do not rename — would orphan devices). */
const NATIVE_OUTDOOR = "|OutdoorTemperatureSensor";
const NATIVE_RAT = "|RAT";
const NATIVE_LAT = "|LAT";
/** Wired remote indoor probe (Sensor Values offsets 2–3) — often installed as return-air. */
const NATIVE_REMOTE = "|RemoteTemperature";

/** User-facing name suffixes appended to the thermostat name. */
const DISPLAY_OUTDOOR = " Outdoor Temperature";
const DISPLAY_RETURN_AIR = " Return Air Temperature";
/** LAT in the guide — supply air leaving the equipment (clearer for homeowners). */
const DISPLAY_SUPPLY_AIR = " Supply Air Temperature";
const DISPLAY_REMOTE = " Remote Temperature";

type AuxNativeSuffix =
    | typeof NATIVE_RAT
    | typeof NATIVE_LAT
    | typeof NATIVE_REMOTE;

function isTemperatureSensorOk(status: TemperatureSensorStatus): boolean {
    return status === TemperatureSensorStatus.NoError;
}

export class AprilairePlugin extends ScryptedDeviceBase implements DeviceProvider, DeviceCreator, Settings {
    storageSettings = new StorageSettings(this, {
        syncOutdoorSensor: {
            title: "Sync Outdoor Sensors",
            type: "boolean",
            description: "If one of your thermostats has an outdoor sensor, allow the value to be synced to your other thermostats that don't have outdoor sensors installed."
        },
        syncOutdoorSensorInterval: {
            title: "Sync Outdoor Sensor Interval",
            type: "number",
            defaultValue: 1,
            description: "The number of minutes between how often to sync the outdoor sensor value to thermostats that don't have an outdoor sensor installed.",
            onPut: this.setupOutdoorsSensorsInterval.bind(this)
        },
        syncAwayHold: {
            title: "Sync Away Hold",
            type: "boolean",
            description: "If one of your thermostats is set to away, allow the hold to be synced to your other thermostats."
        },
        syncVacationHold: {
            title: "Sync Vacation Hold",
            type: "boolean",
            description: "If one of your thermostats is set to vacation, allow the hold to be synced to your other thermostats."
        }
    });

    clients = new Map<string, AprilaireClient>();
    thermostats = new Map<string, AprilaireThermostat | AprilaireHumidifier | AprilaireDehumidifier>();
    outdoorSensors = new Map<string, AprilaireOutdoorThermometer>();
    /** Keyed by full nativeId (`mac|RAT`, `mac|LAT`, `mac|RemoteTemperature`). */
    auxSensors = new Map<string, AprilaireAuxThermometer>();
    /**
     * Setup/1 outdoor-sensor mode per MAC.
     * Automation = ODT is written by this plugin (or another automation) — do **not**
     * expose a child Outdoor sensor (it would just mirror the synced value).
     */
    outdoorSensorMode = new Map<string, OutdoorSensorStatus>();
    /** MACs with OutdoorSensorStatus.Automation (receivers of ODT sync writes). */
    automatedOutdoorSensors: string[] = [];
    automatedOutdoorSensorsTimer: NodeJS.Timeout;
    /** Always poll §5.1 Sensor Values (COS=No) so RAT/LAT/remote stay fresh. */
    sensorValuesTimer: NodeJS.Timeout;
    /** nativeIds we already tried to purge as stale ghosts (avoid remove spam each poll). */
    private sensorCleanupAttempted = new Set<string>();

    constructor(nativeId?: string) {
        super(nativeId);

        this.setupOutdoorsSensorsInterval(0, this.storageSettings.values.syncOutdoorSensorInterval);
        // Sensor Values is not COS-capable — poll every minute regardless of outdoor sync.
        this.sensorValuesTimer = setInterval(() => this.pollSensorValues(), 60 * 1000);
        this.sensorValuesTimer.unref?.();
    }

    async releaseDevice(id: string, nativeId: string): Promise<void> {
        if (this.thermostats.has(nativeId))
            this.thermostats.delete(nativeId);
        if (this.auxSensors.has(nativeId))
            this.auxSensors.delete(nativeId);
        if (nativeId.endsWith(NATIVE_OUTDOOR)) {
            const mac = nativeId.replace(NATIVE_OUTDOOR, "");
            this.outdoorSensors.delete(mac);
        }
    }

    private setupOutdoorsSensorsInterval(oldValue: any, newValue: any) {
        if (newValue === 0) {
            clearInterval(this.automatedOutdoorSensorsTimer);
            return;
        }

        clearInterval(this.automatedOutdoorSensorsTimer);
        this.automatedOutdoorSensorsTimer = setInterval(this.refreshOutdoorSensors.bind(this), newValue * 60 * 1000);
    }

    /** Full §5.1 array for every connected thermostat (return/supply/remote/wireless). */
    private pollSensorValues() {
        this.clients.forEach((client) => {
            if (!client.mac)
                return;
            client.read(new SensorValuesRequest());
        });
    }

    private async refreshOutdoorSensors() {
        // Always refresh Sensor Values so aux sensors update even when outdoor sync is off.
        this.pollSensorValues();

        if (this.storageSettings.values.syncOutdoorSensor === false)
            return;

        this.clients.forEach((client) => {
            if (this.automatedOutdoorSensors.indexOf(client.mac) >= 0)
                return;

            // Controlling sensors for multi-stat ODT sync source values.
            client.read(new ControllingSensorsStatusAndValueRequest());
        });
    }

    private responseReceived(response: BasePayloadResponse, responseClient: AprilaireClient) {
        if (response instanceof ThermostatInstallerSettingsResponse) {
            void this.handleOutdoorSensorMode(responseClient, response.outdoorSensor);
        }

        else if (response instanceof ScheduleHoldResponse) {
            if ((response.hold === HoldType.Vacation && this.storageSettings.values.syncVacationHold) || (response.hold === HoldType.Away && this.storageSettings.values.syncAwayHold)) {
                let request = new ScheduleHoldRequest();
                request.hold = response.hold;
                request.fan = response.fan;
                request.heatSetpoint = response.heatSetpoint;
                request.coolSetpoint = response.coolSetpoint;
                request.dehumidifierSetpoint = response.dehumidifierSetpoint;
                request.endDate = response.endDate;
                
                // write teh hold to the other thermostats
                this.clients.forEach((client) => {
                    if (client.mac === responseClient.mac)
                        return;

                    client.write(request);
                });
            }
        }

        else if (response instanceof ControllingSensorsStatusAndValueResponse) {
            void this.handleControllingSensors(response, responseClient);
        }

        else if (response instanceof SensorValuesResponse) {
            void this.handleSensorValues(response, responseClient);
        }
    }

    /**
     * Track Setup/1 outdoor-sensor mode. Automation receivers get written ODT from
     * another thermostat — they must not grow their own Outdoor child device.
     */
    private async handleOutdoorSensorMode(
        responseClient: AprilaireClient,
        mode: OutdoorSensorStatus
    ): Promise<void> {
        const mac = responseClient.mac;
        if (!mac)
            return;

        this.outdoorSensorMode.set(mac, mode);

        if (mode === OutdoorSensorStatus.Automation) {
            if (this.automatedOutdoorSensors.indexOf(mac) === -1)
                this.automatedOutdoorSensors.push(mac);
            // Drop any Outdoor child created earlier from mirrored/written ODT values.
            await this.removeOutdoorSensor(mac, "installer mode=Automation (ODT fed by sync)");
        } else {
            this.automatedOutdoorSensors = this.automatedOutdoorSensors.filter((m) => m !== mac);
            if (mode === OutdoorSensorStatus.NotInstalled) {
                await this.removeOutdoorSensor(mac, "installer mode=NotInstalled");
            }
        }

        this.console.info(`[${mac}] outdoor sensor mode=${OutdoorSensorStatus[mode] ?? mode}`);
    }

    /** True only when this thermostat has a physical outdoor probe (not automation-fed). */
    private hasPhysicalOutdoorSensor(mac: string): boolean {
        const mode = this.outdoorSensorMode.get(mac);
        // Wait for installer settings when unknown — avoid creating from written ODT.
        if (mode === undefined)
            return false;
        return mode === OutdoorSensorStatus.Installed;
    }

    private async handleControllingSensors(
        response: ControllingSensorsStatusAndValueResponse,
        responseClient: AprilaireClient
    ): Promise<void> {
        if (response.outdoorTemperatureStatus === TemperatureSensorStatus.NoError) {
            // Child Outdoor device only for physically installed ODT (not Automation receivers).
            if (this.hasPhysicalOutdoorSensor(responseClient.mac)) {
                await this.updateOutdoorSensor(
                    responseClient,
                    response.outdoorTemperature,
                    response.outdoorHumidityStatus === HumiditySensorStatus.NoError
                        ? response.outdoorHumidity
                        : undefined
                );
            }

            // Sync writers: physical sources push ODT to Automation thermostats.
            if (
                this.storageSettings.values.syncOutdoorSensor &&
                this.hasPhysicalOutdoorSensor(responseClient.mac)
            ) {
                this.automatedOutdoorSensors
                    .filter((mac) => mac !== responseClient.mac)
                    .forEach((mac) => {
                        const request = new WrittenOutdoorTemperatureValueRequest();
                        request.temperature = response.outdoorTemperature;
                        const client = this.clients.get(mac);
                        client?.write(request);
                    });
            }
        }
    }

    private async handleSensorValues(
        response: SensorValuesResponse,
        responseClient: AprilaireClient
    ): Promise<void> {
        this.console.info(
            `[${responseClient.mac}] Sensor Values: ` +
            `RAT status=${response.returningAirTemperatureStatus} val=${response.returningAirTemperature}°C, ` +
            `LAT status=${response.leavingAirTemperatureStatus} val=${response.leavingAirTemperature}°C, ` +
            `remote status=${response.indoorWiredRemoteTemperatureStatus} val=${response.indoorWiredRemoteTemperature}°C, ` +
            `ODT status=${response.outdoorTemperatureStatus}/${response.outdoorWirelessTemperatureStatus} ` +
            `mode=${this.outdoorSensorMode.get(responseClient.mac) ?? "unknown"}`
        );

        // Outdoor child device: physical install only (never Automation-fed mirrors).
        if (this.hasPhysicalOutdoorSensor(responseClient.mac)) {
            let outdoorTemp: number | undefined;
            let outdoorHumidity: number | undefined;

            if (isTemperatureSensorOk(response.outdoorTemperatureStatus)) {
                outdoorTemp = response.outdoorTemperature;
            } else if (isTemperatureSensorOk(response.outdoorWirelessTemperatureStatus)) {
                outdoorTemp = response.outdoorWirelessTemperature;
            }

            if (response.outdoorHumidityStatus === HumiditySensorStatus.NoError) {
                outdoorHumidity = response.outdoorHumidity;
            }

            if (outdoorTemp !== undefined) {
                await this.updateOutdoorSensor(responseClient, outdoorTemp, outdoorHumidity);
            }
        }

        // Aux probes: only when status is NoError (strict). NotInstalled / errors → remove if present.
        await this.maybeUpdateAuxFromStatus(
            responseClient,
            NATIVE_RAT,
            DISPLAY_RETURN_AIR,
            response.returningAirTemperatureStatus,
            response.returningAirTemperature
        );
        await this.maybeUpdateAuxFromStatus(
            responseClient,
            NATIVE_LAT,
            DISPLAY_SUPPLY_AIR,
            response.leavingAirTemperatureStatus,
            response.leavingAirTemperature
        );
        await this.maybeUpdateAuxFromStatus(
            responseClient,
            NATIVE_REMOTE,
            DISPLAY_REMOTE,
            response.indoorWiredRemoteTemperatureStatus,
            response.indoorWiredRemoteTemperature
        );
    }

    private async maybeUpdateAuxFromStatus(
        responseClient: AprilaireClient,
        suffix: AuxNativeSuffix,
        nameSuffix: string,
        status: TemperatureSensorStatus,
        temperature: number
    ): Promise<void> {
        const nativeId = responseClient.mac + suffix;

        // Strict: only NoError means a real, healthy probe is reporting.
        // Earlier we treated any status ≠ NotInstalled as present, which created
        // ghost RAT/LAT/Remote devices on stats that don't have those probes.
        if (!isTemperatureSensorOk(status)) {
            if (this.auxSensors.has(nativeId)) {
                await this.removeAuxSensor(
                    nativeId,
                    `${nameSuffix.trim()} status=${status} (${TemperatureSensorStatus[status] ?? status})`
                );
            } else if (!this.sensorCleanupAttempted.has(nativeId)) {
                // One-shot purge of ghosts left by older plugin builds.
                this.sensorCleanupAttempted.add(nativeId);
                try {
                    await deviceManager.onDeviceRemoved(nativeId);
                    this.console.info(`[${nativeId}] purged stale aux sensor (${nameSuffix.trim()} status=${status})`);
                } catch {
                    // not present
                }
            }
            return;
        }

        this.sensorCleanupAttempted.delete(nativeId);
        await this.updateAuxSensor(responseClient, suffix, nameSuffix, temperature);
    }

    async getOrAddOutdoorSensor(responseClient: AprilaireClient): Promise<AprilaireOutdoorThermometer | undefined> {
        const mac = responseClient.mac;
        if (!this.hasPhysicalOutdoorSensor(mac)) {
            this.console.info(
                `[${mac}] skip Outdoor sensor create (mode=${this.outdoorSensorMode.get(mac) ?? "unknown"}, need Installed)`
            );
            return undefined;
        }

        const nativeId = mac + NATIVE_OUTDOOR;

        // Register instance BEFORE onDeviceDiscovered so Scrypted's getDevice
        // callback returns the same object we will update.
        if (!this.outdoorSensors.has(mac)) {
            this.outdoorSensors.set(mac, new AprilaireOutdoorThermometer(nativeId));
            const d: Device = {
                providerNativeId: this.nativeId,
                name: responseClient.name + DISPLAY_OUTDOOR,
                type: ScryptedDeviceType.Sensor,
                nativeId,
                interfaces: [
                    ScryptedInterface.Thermometer,
                    ScryptedInterface.HumiditySensor,
                ],
                info: {
                    model: responseClient.model,
                    manufacturer: "Aprilaire",
                    serialNumber: mac,
                    firmware: responseClient.firmware,
                    version: responseClient.hardware
                }
            };
            await deviceManager.onDeviceDiscovered(d);
            this.console.info(`[${mac}] discovered Outdoor Temperature (physical install)`);
        }

        return this.outdoorSensors.get(mac);
    }

    private async updateOutdoorSensor(
        responseClient: AprilaireClient,
        temperature: number,
        humidity?: number
    ): Promise<void> {
        const outdoorSensor = await this.getOrAddOutdoorSensor(responseClient);
        if (!outdoorSensor)
            return;
        outdoorSensor.temperature = temperature;
        outdoorSensor.setTemperatureUnit(TemperatureUnit.C);
        if (humidity !== undefined) {
            outdoorSensor.humidity = humidity;
        }
    }

    private async removeOutdoorSensor(mac: string, reason: string): Promise<void> {
        const nativeId = mac + NATIVE_OUTDOOR;
        if (!this.outdoorSensors.has(mac)) {
            // Still try remove in case Scrypted has a stale device from a prior version.
            try {
                await deviceManager.onDeviceRemoved(nativeId);
            } catch {
                // ignore missing
            }
            return;
        }
        this.outdoorSensors.delete(mac);
        try {
            await deviceManager.onDeviceRemoved(nativeId);
            this.console.info(`[${mac}] removed Outdoor sensor: ${reason}`);
        } catch (e) {
            this.console.warn(`[${mac}] remove Outdoor sensor failed: ${e}`);
        }
    }

    private async removeAuxSensor(nativeId: string, reason: string): Promise<void> {
        const had = this.auxSensors.has(nativeId);
        this.auxSensors.delete(nativeId);
        try {
            await deviceManager.onDeviceRemoved(nativeId);
            if (had)
                this.console.info(`[${nativeId}] removed aux sensor: ${reason}`);
        } catch {
            // Device may not exist in Scrypted yet — fine.
        }
    }

    private async ensureAuxSensor(
        responseClient: AprilaireClient,
        suffix: AuxNativeSuffix,
        nameSuffix: string
    ): Promise<AprilaireAuxThermometer> {
        const nativeId = responseClient.mac + suffix;

        // Register before discovery so getDevice during onDeviceDiscovered
        // reuses this instance (avoids orphaned UI objects with no temperature).
        if (!this.auxSensors.has(nativeId)) {
            this.auxSensors.set(nativeId, new AprilaireAuxThermometer(nativeId));
            const d: Device = {
                providerNativeId: this.nativeId,
                name: responseClient.name + nameSuffix,
                type: ScryptedDeviceType.Sensor,
                nativeId,
                interfaces: [ScryptedInterface.Thermometer],
                info: {
                    model: responseClient.model,
                    manufacturer: "Aprilaire",
                    serialNumber: responseClient.mac,
                    firmware: responseClient.firmware,
                    version: responseClient.hardware,
                },
            };
            await deviceManager.onDeviceDiscovered(d);
            this.console.info(`[${responseClient.mac}] discovered aux sensor ${nativeId} (${nameSuffix.trim()})`);
        }

        return this.auxSensors.get(nativeId);
    }

    private async updateAuxSensor(
        responseClient: AprilaireClient,
        suffix: AuxNativeSuffix,
        nameSuffix: string,
        temperature: number
    ): Promise<void> {
        const sensor = await this.ensureAuxSensor(responseClient, suffix, nameSuffix);
        sensor.temperature = temperature;
        sensor.setTemperatureUnit(TemperatureUnit.C);
    }

    /** @deprecated use updateOutdoorSensor — kept for call-site compatibility */
    async setOutdoorTemperature(response: ControllingSensorsStatusAndValueResponse, responseClient: AprilaireClient): Promise<void> {
        await this.handleControllingSensors(response, responseClient);
    }

    getSettings(): Promise<Setting[]> {
        return this.storageSettings.getSettings();
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }

    async getDevice(nativeId: string): Promise<any> {
        if (this.thermostats.has(nativeId))
            return this.thermostats.get(nativeId);

        if (nativeId.endsWith(NATIVE_OUTDOOR)) {
            const mac = nativeId.replace(NATIVE_OUTDOOR, "");
            if (!this.outdoorSensors.has(mac))
                this.outdoorSensors.set(mac, new AprilaireOutdoorThermometer(nativeId));
            return this.outdoorSensors.get(mac);
        }

        if (
            nativeId.endsWith(NATIVE_RAT) ||
            nativeId.endsWith(NATIVE_LAT) ||
            nativeId.endsWith(NATIVE_REMOTE)
        ) {
            if (!this.auxSensors.has(nativeId))
                this.auxSensors.set(nativeId, new AprilaireAuxThermometer(nativeId));
            return this.auxSensors.get(nativeId);
        }

        let s = deviceManager.getDeviceStorage(nativeId);
        if (s) {
            const host = s.getItem("host");
            const port = Number(s.getItem("port"));

            await this.connectThermostat(host, port);

            if (this.thermostats.has(nativeId))
                return this.thermostats.get(nativeId);
        }

        return undefined;
    }

    /**
     * Force the real thermostat label onto all child devices for this MAC.
     *
     * Scrypted keeps the first discovered name for existing devices; calling
     * onDeviceDiscovered again with a new name does **not** rename them.
     * Setting `device.name` (device state) is what actually updates the UI.
     */
    private async applyClientDisplayName(client: AprilaireClient): Promise<void> {
        const base = (client.name || AprilaireClient.DEFAULT_NAME).trim() || AprilaireClient.DEFAULT_NAME;
        const mac = client.mac;
        if (!mac)
            return;

        // Do not push the generic fallback over devices that already have a better name
        // unless they still show the fallback.
        this.console.info(`[${mac}] applying display name "${base}"`);

        const rename = async (
            nativeId: string,
            name: string,
            type: ScryptedDeviceType,
            interfaces: string[],
            device?: { name?: string; id?: string }
        ) => {
            // 1) Device state (what Scrypted UI reads for the current name)
            if (device) {
                try {
                    device.name = name;
                } catch (e) {
                    this.console.warn(`[${nativeId}] device.name set failed: ${e}`);
                }
            }
            // 2) Direct device-state write (belt and suspenders)
            try {
                const state = deviceManager.getDeviceState(nativeId);
                if (state)
                    state.name = name;
            } catch (e) {
                this.console.warn(`[${nativeId}] getDeviceState name set failed: ${e}`);
            }
            // 3) Refresh discovery metadata (interfaces/info); name alone is not enough)
            await deviceManager.onDeviceDiscovered({
                providerNativeId: this.nativeId,
                nativeId,
                name,
                type,
                interfaces,
                info: {
                    model: client.model,
                    manufacturer: "Aprilaire",
                    serialNumber: mac,
                    firmware: client.firmware,
                    version: client.hardware,
                },
            });
            this.console.info(`[${nativeId}] renamed → "${name}"`);
        };

        const thermo = this.thermostats.get(mac);
        if (thermo) {
            const ifaces = [
                ScryptedInterface.OnOff,
                ScryptedInterface.Online,
                ScryptedInterface.Refresh,
                ScryptedInterface.Settings,
                ScryptedInterface.TemperatureSetting,
                ScryptedInterface.Fan,
                ScryptedInterface.Thermometer,
                ScryptedInterface.HumiditySensor,
                ScryptedInterface.FilterMaintenance,
            ];
            if (client.system?.humidification || client.system?.dehumidification)
                ifaces.push(ScryptedInterface.HumiditySetting);
            await rename(mac, base, ScryptedDeviceType.Thermostat, ifaces, thermo);
        }

        const humId = mac + "-humidifier";
        const hum = this.thermostats.get(humId);
        if (hum) {
            await rename(humId, base + " Humidifier", ScryptedDeviceType.Fan, [
                ScryptedInterface.OnOff,
                ScryptedInterface.Online,
                ScryptedInterface.Refresh,
                ScryptedInterface.HumiditySetting,
                ScryptedInterface.HumiditySensor,
                ScryptedInterface.FilterMaintenance,
                ScryptedInterface.Fan,
            ], hum);
        }

        const dehumId = mac + "-dehumidifier";
        const dehum = this.thermostats.get(dehumId);
        if (dehum) {
            await rename(dehumId, base + " Dehumidifier", ScryptedDeviceType.Fan, [
                ScryptedInterface.OnOff,
                ScryptedInterface.Online,
                ScryptedInterface.Refresh,
                ScryptedInterface.HumiditySetting,
                ScryptedInterface.HumiditySensor,
                ScryptedInterface.FilterMaintenance,
                ScryptedInterface.Fan,
            ], dehum);
        }

        const outdoor = this.outdoorSensors.get(mac);
        if (outdoor) {
            await rename(mac + NATIVE_OUTDOOR, base + DISPLAY_OUTDOOR, ScryptedDeviceType.Sensor, [
                ScryptedInterface.Thermometer,
                ScryptedInterface.HumiditySensor,
            ], outdoor);
        }

        for (const [suffix, display] of [
            [NATIVE_RAT, DISPLAY_RETURN_AIR],
            [NATIVE_LAT, DISPLAY_SUPPLY_AIR],
            [NATIVE_REMOTE, DISPLAY_REMOTE],
        ] as const) {
            const id = mac + suffix;
            const aux = this.auxSensors.get(id);
            if (aux) {
                await rename(id, base + display, ScryptedDeviceType.Sensor, [
                    ScryptedInterface.Thermometer,
                ], aux);
            }
        }
    }

    private connectThermostat(host: string, port: number) : Promise<any> {
        if (host === undefined || isNaN(port))
            return Promise.reject("host and port are required");

        const client = new AprilaireClient(host, port);
        const self = this;

        client.on("response", self.responseReceived.bind(self));
        client.on("name", (c: AprilaireClient) => {
            void self.applyClientDisplayName(c);
        });

        return new Promise<any>((resolve) => {
            client.connect();
            client.once("ready", async () => {

                const devices: Device[] = [];

                // If name already settled (including real names learned during the grace wait),
                // use it; otherwise temporary fallback until settleName/emit renames.
                const d: Device = {
                    providerNativeId: self.nativeId,
                    name: client.name,
                    type: ScryptedDeviceType.Thermostat,
                    nativeId: client.mac,
                    interfaces: [
                        ScryptedInterface.OnOff,
                        ScryptedInterface.Online,
                        ScryptedInterface.Refresh,
                        ScryptedInterface.Settings,
                        ScryptedInterface.TemperatureSetting,
                        ScryptedInterface.Fan,
                        ScryptedInterface.Thermometer,
                        ScryptedInterface.HumiditySensor,
                        ScryptedInterface.FilterMaintenance,
                    ],
                    info: {
                        model: client.model,
                        manufacturer: "Aprilaire",
                        serialNumber: client.mac,
                        firmware: client.firmware,
                        version: client.hardware
                    }
                };

                // add humidity setting if either a humidifier or dehumidifer is supported so that TargetRelativeHumidity can be published to HomeKit
                if (client.system.humidification || client.system.dehumidification) {
                    d.interfaces.push(ScryptedInterface.HumiditySetting);
                }

                await deviceManager.onDeviceDiscovered(d);
                devices.push(d);

                self.clients.set(d.nativeId, client);

                const t = new AprilaireThermostat(d.nativeId, client);
                let hum:AprilaireHumidifier;
                let deHum:AprilaireDehumidifier;

                self.thermostats.set(d.nativeId, t);

                if (client.system.humidification) {
                    const dh = { ...d };
                    dh.interfaces = [
                        ScryptedInterface.OnOff,
                        ScryptedInterface.Online,
                        ScryptedInterface.Refresh,
                        ScryptedInterface.HumiditySetting,
                        ScryptedInterface.HumiditySensor,
                        ScryptedInterface.FilterMaintenance,
                        ScryptedInterface.Fan
                    ];
                    dh.nativeId = client.mac + "-humidifier";
                    dh.name = client.name + " Humidifier";
                    dh.type = ScryptedDeviceType.Fan;

                    await deviceManager.onDeviceDiscovered(dh);
                    devices.push(dh);

                    hum = new AprilaireHumidifier(dh.nativeId, client);
                    self.thermostats.set(dh.nativeId, hum);
                } 
                
                if (client.system.dehumidification) {
                    const dh = { ...d };
                    dh.interfaces = [
                        ScryptedInterface.OnOff,
                        ScryptedInterface.Online,
                        ScryptedInterface.Refresh,
                        ScryptedInterface.HumiditySetting,
                        ScryptedInterface.HumiditySensor,
                        ScryptedInterface.FilterMaintenance,
                        ScryptedInterface.Fan
                    ];
                    dh.nativeId = client.mac + "-dehumidifier";
                    dh.name = client.name + " Dehumidifier";
                    dh.type = ScryptedDeviceType.Fan;

                    await deviceManager.onDeviceDiscovered(dh);
                    devices.push(dh);

                    deHum = new AprilaireDehumidifier(dh.nativeId, client);
                    self.thermostats.set(dh.nativeId, deHum);
                }

                const s = deviceManager.getDeviceStorage(d.nativeId);
                s.setItem("host", host);
                s.setItem("port", port.toString());

                // Force UI name immediately (existing devices keep their first name otherwise).
                await self.applyClientDisplayName(client);

                // Explicit Setup/1 read for deadband / Away / Heat Blast gates (also COS-subscribed).
                client.read(new ThermostatInstallerSettingsRequest());
                // Full §5.1 sensor array (COS=No — must ReadRequest; return/supply air, wireless outdoor).
                client.read(new SensorValuesRequest());
                // Sync dumps current state for all COS-subscribed attributes (includes Setup/1).
                client.write(new SyncRequest());
                // Re-read Sensor Values + name shortly after connect in case replies are lost
                // behind the identification/COS/sync burst.
                setTimeout(() => {
                    if (!client.mac)
                        return;
                    client.read(new SensorValuesRequest());
                    client.requestThermostatName();
                }, 3000);
                // Late name recovery: re-apply whatever we have after the grace/re-read window.
                setTimeout(() => {
                    if (client.mac)
                        void self.applyClientDisplayName(client);
                }, 5000);

                resolve({nativeId: d.nativeId, device: d, thermostat: t, humidifier: hum, dehumidifier: deHum});
            });
        });
    }

    async createDevice(settings: DeviceCreatorSettings): Promise<string> {
        const host = settings.host.toString();
        const port = Number(settings.port);

        const { nativeId } = await this.connectThermostat(host, port);
        return nativeId;
    }  

    async getCreateDeviceSettings(): Promise<Setting[]> {
        return [
            {
                key: 'host',
                title: "IP Address",
                type: "string",
                placeholder: "192.168.1.XX",
                description: "The IP Address of the fan on your local network."
            },
            {
                key: 'port',
                title: "Port",
                type: "number",
                placeholder: "8000",
                description: "The port the termostat uses to communicate, typically 8000 for 8800 series, and 7000 for 6000 series thermostats."
            }
        ];
    }
}