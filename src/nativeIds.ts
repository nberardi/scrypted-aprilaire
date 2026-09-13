/**
 * Stable Scrypted nativeId suffixes (internal; do not rename — would orphan devices).
 *
 * The thermostat root nativeId is the MAC (hex, no separators). Child devices
 * append a suffix. Host/port storage lives on the root and is copied onto
 * children so getDevice can reconnect regardless of lookup order.
 */

export const NATIVE_OUTDOOR = "|OutdoorTemperatureSensor";
export const NATIVE_RAT = "|RAT";
export const NATIVE_LAT = "|LAT";
export const NATIVE_REMOTE = "|RemoteTemperature";
export const NATIVE_HUMIDIFIER = "-humidifier";
export const NATIVE_DEHUMIDIFIER = "-dehumidifier";

const CHILD_SUFFIXES = [
    NATIVE_OUTDOOR,
    NATIVE_RAT,
    NATIVE_LAT,
    NATIVE_REMOTE,
    NATIVE_HUMIDIFIER,
    NATIVE_DEHUMIDIFIER,
] as const;

/** User-facing name suffixes appended to the thermostat name. */
export const DISPLAY_OUTDOOR = " Outdoor Temperature";
export const DISPLAY_RETURN_AIR = " Return Air Temperature";
/** LAT in the guide — supply air leaving the equipment (clearer for homeowners). */
export const DISPLAY_SUPPLY_AIR = " Supply Air Temperature";
export const DISPLAY_REMOTE = " Remote Temperature";

export type AuxNativeSuffix =
    | typeof NATIVE_RAT
    | typeof NATIVE_LAT
    | typeof NATIVE_REMOTE;

/**
 * MAC (thermostat root nativeId) for any child or root nativeId.
 * Root IDs are returned unchanged.
 */
export function thermostatMacFromNativeId(nativeId: string): string {
    for (const suffix of CHILD_SUFFIXES) {
        if (nativeId.endsWith(suffix))
            return nativeId.slice(0, -suffix.length);
    }
    return nativeId;
}

export function isAuxTemperatureNativeId(nativeId: string): boolean {
    return nativeId.endsWith(NATIVE_RAT)
        || nativeId.endsWith(NATIVE_LAT)
        || nativeId.endsWith(NATIVE_REMOTE);
}

export function isIaqChildNativeId(nativeId: string): boolean {
    return nativeId.endsWith(NATIVE_HUMIDIFIER) || nativeId.endsWith(NATIVE_DEHUMIDIFIER);
}
