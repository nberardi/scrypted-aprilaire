import sdk, { Device, DeviceCreator, DeviceCreatorSettings, ScryptedDeviceType, ScryptedInterface, SettingValue, TemperatureUnit } from '@scrypted/sdk';
import { DeviceProvider, ScryptedDeviceBase, Setting, Settings } from '@scrypted/sdk';
import { StorageSettings } from "@scrypted/sdk/storage-settings";
import { AprilaireClient } from './AprilaireClient';
import { BasePayloadResponse } from "./BasePayloadResponse";
import {
    ControllingSensorsStatusAndValueResponse,
    HumiditySensorStatus,
    SensorValuesRequest,
    SensorValuesResponse,
    TemperatureSensorStatus,
    WrittenOutdoorTemperatureValueRequest,
    clampWrittenOdtIntervalMinutes,
} from './FunctionalDomainSensors';
import { ThermostatInstallerSettingsResponse, OutdoorSensorStatus } from './FunctionalDomainSetup';
import { HoldType, ScheduleHoldRequest, ScheduleHoldResponse, scheduleHoldFingerprint } from './FunctionalDomainScheduling';
import { SyncRequest } from './FunctionalDomainStatus';
import { setInterval } from 'node:timers';
import { AprilaireOutdoorThermometer } from './AprilaireOutdoorThermometer';
import { AprilaireAuxThermometer } from './AprilaireAuxThermometer';
import { AprilaireThermostat } from './AprilaireThermostat';
import { AprilaireDehumidifier } from './AprilaireDehumidifier';
import { AprilaireHumidifier } from './AprilaireHumidifier';
import { HoldSyncEchoGuard } from './HoldSyncEchoGuard';
import {
    AuxNativeSuffix,
    DISPLAY_OUTDOOR,
    DISPLAY_REMOTE,
    DISPLAY_RETURN_AIR,
    DISPLAY_SUPPLY_AIR,
    NATIVE_DEHUMIDIFIER,
    NATIVE_HUMIDIFIER,
    NATIVE_LAT,
    NATIVE_OUTDOOR,
    NATIVE_RAT,
    NATIVE_REMOTE,
    isAuxTemperatureNativeId,
    thermostatMacFromNativeId,
} from './nativeIds';

const { deviceManager } = sdk;

function isTemperatureSensorOk(status: TemperatureSensorStatus): boolean {
    return status === TemperatureSensorStatus.NoError;
}

/**
 * How long device creation waits for Identification to complete.
 *
 * `createDevice` and `getDevice` await this, so an unreachable or wrong-port
 * address used to hang the Scrypted UI indefinitely. The client keeps
 * supervising and reconnecting after the timeout; only this discovery attempt
 * gives up so the caller gets an error it can show.
 */
const DISCOVERY_READY_TIMEOUT_MS = 30_000;

export interface AprilaireDiscoveryResult {
    nativeId: string;
    device: Device;
    thermostat: AprilaireThermostat;
    humidifier?: AprilaireHumidifier;
    dehumidifier?: AprilaireDehumidifier;
}

export class AprilairePlugin extends ScryptedDeviceBase implements DeviceProvider, DeviceCreator, Settings {
    storageSettings = new StorageSettings(this, {
        syncOutdoorSensor: {
            title: "Sync Outdoor Sensors",
            type: "boolean",
            description: "If one of your thermostats has an outdoor sensor, allow the value to be synced to your other thermostats that don't have outdoor sensors installed.",
            onPut: () => this.restartOdtSyncTimer()
        },
        syncOutdoorSensorInterval: {
            title: "Sync Outdoor Sensor Interval",
            type: "number",
            defaultValue: 1,
            description: "Minutes between Written Outdoor Temperature refreshes (§5.4: must be less than 10; values are clamped to 1–9).",
            onPut: () => this.restartOdtSyncTimer()
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

    /** Discovered thermostats keyed by MAC. */
    clients = new Map<string, AprilaireClient>();
    /**
     * One client per `host:port`, created before identification completes.
     *
     * The guide notes a thermostat effectively supports a single home-automation
     * TCP session, and Scrypted calls `getDevice` once per child device on
     * startup. Without this map the concurrent calls for `mac`, `mac-humidifier`
     * and `mac-dehumidifier` each opened their own socket to the same
     * thermostat before the first one finished identifying.
     */
    private clientsByEndpoint = new Map<string, AprilaireClient>();
    /** In-flight/completed discovery per `host:port`, so callers share one attempt. */
    private discoveryByEndpoint = new Map<string, Promise<AprilaireDiscoveryResult>>();
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
    /** Holds we wrote for multi-stat sync — ignore matching COS so we do not echo. */
    private holdSyncEchoes = new HoldSyncEchoGuard();
    /** Last physical outdoor °C — rewritten on the ODT interval without re-polling §5.2. */
    private lastPhysicalOutdoorC?: number;

    constructor(nativeId?: string) {
        super(nativeId);

        this.restartOdtSyncTimer();
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

        // The root nativeId is the MAC: releasing it means the thermostat itself is
        // gone, so stop supervising its socket instead of reconnecting forever.
        if (this.clients.has(nativeId))
            this.releaseClient(nativeId);
    }

    /** Stop supervision and drop every cached reference for one thermostat. */
    private releaseClient(mac: string): void {
        const client = this.clients.get(mac);
        this.clients.delete(mac);

        for (const [endpoint, candidate] of this.clientsByEndpoint) {
            if (candidate !== client)
                continue;
            this.clientsByEndpoint.delete(endpoint);
            this.discoveryByEndpoint.delete(endpoint);
        }

        this.outdoorSensorMode.delete(mac);
        this.automatedOutdoorSensors = this.automatedOutdoorSensors.filter((m) => m !== mac);

        if (!client)
            return;

        try {
            client.disconnect();
        } catch (e) {
            this.console.warn(`[${mac}] disconnect during release failed: ${e}`);
        }
        client.removeAllListeners();
        this.console.info(`[${mac}] released client and stopped reconnect supervision`);
    }

    private restartOdtSyncTimer() {
        clearInterval(this.automatedOutdoorSensorsTimer);
        const syncEnabled = this.storageSettings.values.syncOutdoorSensor !== false;
        const minutes = clampWrittenOdtIntervalMinutes(
            Number(this.storageSettings.values.syncOutdoorSensorInterval),
            syncEnabled
        );
        if (minutes === undefined)
            return;

        this.automatedOutdoorSensorsTimer = setInterval(
            this.refreshOutdoorSensors.bind(this),
            minutes * 60 * 1000
        );
        this.automatedOutdoorSensorsTimer.unref?.();
    }

    private persistConnection(nativeId: string, host: string, port: number): void {
        const storage = deviceManager.getDeviceStorage(nativeId);
        if (!storage)
            return;
        storage.setItem("host", host);
        storage.setItem("port", port.toString());
    }

    /** Look up host/port from this nativeId or its thermostat MAC root. */
    private connectionSettingsFor(nativeId: string): { host: string; port: number } | undefined {
        const tryStorage = (id: string): { host: string; port: number } | undefined => {
            const s = deviceManager.getDeviceStorage(id);
            if (!s)
                return undefined;
            const host = s.getItem("host");
            const port = Number(s.getItem("port"));
            if (!host || isNaN(port))
                return undefined;
            return { host, port };
        };

        return tryStorage(nativeId) ?? tryStorage(thermostatMacFromNativeId(nativeId));
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
        if (this.storageSettings.values.syncOutdoorSensor === false)
            return;
        if (this.lastPhysicalOutdoorC === undefined)
            return;
        this.writeOutdoorToAutomation(this.lastPhysicalOutdoorC);
    }

    private writeOutdoorToAutomation(temperature: number, exceptMac?: string): void {
        for (const mac of this.automatedOutdoorSensors) {
            if (mac === exceptMac)
                continue;
            const request = new WrittenOutdoorTemperatureValueRequest();
            request.temperature = temperature;
            this.clients.get(mac)?.write(request);
        }
    }

    private responseReceived(response: BasePayloadResponse, responseClient: AprilaireClient) {
        if (response instanceof ThermostatInstallerSettingsResponse) {
            void this.handleOutdoorSensorMode(responseClient, response.outdoorSensor);
        }

        else if (response instanceof ScheduleHoldResponse) {
            const syncAway = this.storageSettings.values.syncAwayHold;
            const syncVacation = this.storageSettings.values.syncVacationHold;
            const shouldSync =
                (response.hold === HoldType.Vacation && syncVacation)
                || (response.hold === HoldType.Away && syncAway);
            if (!shouldSync)
                return;

            const fingerprint = scheduleHoldFingerprint(response);
            if (this.holdSyncEchoes.isEcho(responseClient.mac, fingerprint))
                return;

            const request = new ScheduleHoldRequest();
            request.hold = response.hold;
            // Away: hold type only — peers apply their own Away Settings (other fields Null).
            // Vacation: copy fan/setpoints/end date onto the wire.
            if (response.hold === HoldType.Vacation) {
                request.fan = response.fan;
                request.heatSetpoint = response.heatSetpoint;
                request.coolSetpoint = response.coolSetpoint;
                request.dehumidifierSetpoint = response.dehumidifierSetpoint;
                request.endDate = response.endDate;
            }

            this.clients.forEach((client) => {
                if (client.mac === responseClient.mac)
                    return;

                this.holdSyncEchoes.noteWrite(client.mac, fingerprint);
                client.write(request);
            });
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
            if (this.hasPhysicalOutdoorSensor(responseClient.mac)) {
                this.lastPhysicalOutdoorC = response.outdoorTemperature;
                await this.updateOutdoorSensor(
                    responseClient,
                    response.outdoorTemperature,
                    response.outdoorHumidityStatus === HumiditySensorStatus.NoError
                        ? response.outdoorHumidity
                        : undefined
                );

                if (this.storageSettings.values.syncOutdoorSensor) {
                    this.writeOutdoorToAutomation(response.outdoorTemperature, responseClient.mac);
                }
            }
        }
    }

    private async handleSensorValues(
        response: SensorValuesResponse,
        responseClient: AprilaireClient
    ): Promise<void> {
        const nativeId = responseClient.mac;

        this.console.info(
            `[${nativeId}] Sensor Values: ` +
            `RAT status=${response.returningAirTemperatureStatus} val=${response.returningAirTemperature}°C, ` +
            `LAT status=${response.leavingAirTemperatureStatus} val=${response.leavingAirTemperature}°C, ` +
            `remote status=${response.indoorWiredRemoteTemperatureStatus} val=${response.indoorWiredRemoteTemperature}°C, ` +
            `ODT status=${response.outdoorTemperatureStatus}/${response.outdoorWirelessTemperatureStatus} ` +
            `mode=${this.outdoorSensorMode.get(nativeId) ?? "unknown"}`
        );

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
                this.lastPhysicalOutdoorC = outdoorTemp;
                await this.updateOutdoorSensor(responseClient, outdoorTemp, outdoorHumidity);
            }
        }

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

        if (!isTemperatureSensorOk(status)) {
            if (this.auxSensors.has(nativeId)) {
                await this.removeAuxSensor(
                    nativeId,
                    `${nameSuffix.trim()} status=${status} (${TemperatureSensorStatus[status] ?? status})`
                );
            } else if (!this.sensorCleanupAttempted.has(nativeId)) {
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
            this.persistConnection(nativeId, responseClient.host, responseClient.port);
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
            this.persistConnection(nativeId, responseClient.host, responseClient.port);
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

    getSettings(): Promise<Setting[]> {
        return this.storageSettings.getSettings();
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }

    async getDevice(nativeId: string): Promise<any> {
        await this.ensureConnectedForNativeId(nativeId);

        if (this.thermostats.has(nativeId))
            return this.thermostats.get(nativeId);

        if (nativeId.endsWith(NATIVE_OUTDOOR)) {
            const mac = thermostatMacFromNativeId(nativeId);
            return this.outdoorSensors.get(mac);
        }

        if (isAuxTemperatureNativeId(nativeId)) {
            return this.auxSensors.get(nativeId);
        }

        return undefined;
    }

    /**
     * Scrypted calls getDevice independently for each child. Host/port are stored
     * on the MAC root (and copied onto IAQ children); look up either so a
     * humidifier/dehumidifier/aux lookup still opens the one TCP session.
     */
    private async ensureConnectedForNativeId(nativeId: string): Promise<void> {
        const mac = thermostatMacFromNativeId(nativeId);
        if (mac && this.clients.has(mac))
            return;

        const connection = this.connectionSettingsFor(nativeId);
        if (!connection)
            return;

        try {
            await this.connectThermostat(connection.host, connection.port);
        } catch (e) {
            this.console.warn(`[${nativeId}] connect failed: ${e}`);
        }
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
            // 1) Device state (what Scrypted UI reads)
            if (device) {
                try {
                    device.name = name;
                } catch (e) {
                    this.console.warn(`[${nativeId}] device.name set failed: ${e}`);
                }
            }
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

        const humId = mac + NATIVE_HUMIDIFIER;
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

        const dehumId = mac + NATIVE_DEHUMIDIFIER;
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

    /**
     * Connect (or reuse a connection) and discover the devices behind one
     * thermostat. Concurrent callers for the same `host:port` share a single
     * client and a single discovery attempt.
     */
    private connectThermostat(host: string, port: number): Promise<AprilaireDiscoveryResult> {
        if (host === undefined || host === null || host === "" || isNaN(port))
            return Promise.reject(new Error("host and port are required"));

        const endpoint = `${host}:${port}`;
        const existing = this.discoveryByEndpoint.get(endpoint);
        if (existing)
            return existing;

        const attempt = this.discoverThermostat(host, port).catch((e) => {
            // Drop only the failed attempt; the client stays and keeps
            // reconnecting, so a later getDevice/createDevice can succeed
            // without opening a second session.
            this.discoveryByEndpoint.delete(endpoint);
            throw e;
        });

        this.discoveryByEndpoint.set(endpoint, attempt);
        return attempt;
    }

    /** Create the supervised client for an endpoint exactly once. */
    private getOrCreateClient(host: string, port: number): AprilaireClient {
        const endpoint = `${host}:${port}`;
        const existing = this.clientsByEndpoint.get(endpoint);
        if (existing)
            return existing;

        const client = new AprilaireClient(host, port);
        client.on("response", this.responseReceived.bind(this));
        client.on("name", (c: AprilaireClient) => {
            void this.applyClientDisplayName(c);
        });
        client.on("connected", (c: AprilaireClient) => {
            // First connect is bootstrapped by publishDevices once identification
            // completes; a MAC we already discovered means this is a reconnect and
            // the session-scoped COS/Sync state has to be re-established.
            if (c.mac && this.clients.has(c.mac))
                this.bootstrapThermostat(c);
        });

        this.clientsByEndpoint.set(endpoint, client);
        client.connect();
        return client;
    }

    private discoverThermostat(host: string, port: number): Promise<AprilaireDiscoveryResult> {
        const self = this;
        const client = this.getOrCreateClient(host, port);

        return new Promise<AprilaireDiscoveryResult>((resolve, reject) => {
            let settled = false;

            const readyTimer = setTimeout(() => {
                if (settled)
                    return;
                settled = true;
                reject(new Error(
                    `[${host}:${port}] thermostat did not complete identification within ${DISCOVERY_READY_TIMEOUT_MS}ms; ` +
                    `check the IP address and port (8000 for 8800 series, 7000 for 6000 series)`
                ));
            }, DISCOVERY_READY_TIMEOUT_MS);
            readyTimer.unref?.();

            const onReady = async () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(readyTimer);

                try {
                    resolve(await self.publishDevices(client, host, port));
                } catch (e) {
                    reject(e);
                }
            };

            // Already identified (endpoint reused after an earlier timeout).
            if (client.isReady) {
                void onReady();
                return;
            }

            client.once("ready", () => { void onReady(); });
        });
    }

    /**
     * Register the thermostat and its optional humidifier/dehumidifier with
     * Scrypted, then run the connect-time bootstrap reads.
     */
    private async publishDevices(client: AprilaireClient, host: string, port: number): Promise<AprilaireDiscoveryResult> {
        const self = this;

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

        self.clients.set(d.nativeId, client);

        const t = new AprilaireThermostat(d.nativeId, client);
        let hum: AprilaireHumidifier;
        let deHum: AprilaireDehumidifier;

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
            dh.nativeId = client.mac + NATIVE_HUMIDIFIER;
            dh.name = client.name + " Humidifier";
            dh.type = ScryptedDeviceType.Fan;

            await deviceManager.onDeviceDiscovered(dh);

            hum = new AprilaireHumidifier(dh.nativeId, client);
            self.thermostats.set(dh.nativeId, hum);
            self.persistConnection(dh.nativeId, host, port);
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
            dh.nativeId = client.mac + NATIVE_DEHUMIDIFIER;
            dh.name = client.name + " Dehumidifier";
            dh.type = ScryptedDeviceType.Fan;

            await deviceManager.onDeviceDiscovered(dh);

            deHum = new AprilaireDehumidifier(dh.nativeId, client);
            self.thermostats.set(dh.nativeId, deHum);
            self.persistConnection(dh.nativeId, host, port);
        }

        self.persistConnection(d.nativeId, host, port);

        // Force UI name immediately (existing devices keep their first name otherwise).
        await self.applyClientDisplayName(client);

        self.bootstrapThermostat(client);

        return { nativeId: d.nativeId, device: d, thermostat: t, humidifier: hum, dehumidifier: deHum };
    }

    private bootstrapThermostat(client: AprilaireClient): void {
        client.read(new SensorValuesRequest());
        client.write(new SyncRequest());
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
                description: "The IP Address of the thermostat on your local network."
            },
            {
                key: 'port',
                title: "Port",
                type: "number",
                placeholder: "8000",
                description: "Typically 8000 for 8800 series, 7000 for 6000 series."
            }
        ];
    }
}