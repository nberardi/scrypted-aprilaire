import { describe, expect, it } from "vitest";
import {
    NATIVE_DEHUMIDIFIER,
    NATIVE_HUMIDIFIER,
    NATIVE_LAT,
    NATIVE_OUTDOOR,
    NATIVE_RAT,
    NATIVE_REMOTE,
    isAuxTemperatureNativeId,
    isIaqChildNativeId,
    thermostatMacFromNativeId,
} from "../src/nativeIds";

describe("nativeIds", () => {
    const mac = "aabbccddeeff";

    it("returns the thermostat MAC for every child suffix", () => {
        expect(thermostatMacFromNativeId(mac)).toBe(mac);
        expect(thermostatMacFromNativeId(mac + NATIVE_HUMIDIFIER)).toBe(mac);
        expect(thermostatMacFromNativeId(mac + NATIVE_DEHUMIDIFIER)).toBe(mac);
        expect(thermostatMacFromNativeId(mac + NATIVE_OUTDOOR)).toBe(mac);
        expect(thermostatMacFromNativeId(mac + NATIVE_RAT)).toBe(mac);
        expect(thermostatMacFromNativeId(mac + NATIVE_LAT)).toBe(mac);
        expect(thermostatMacFromNativeId(mac + NATIVE_REMOTE)).toBe(mac);
    });

    it("classifies IAQ vs aux children", () => {
        expect(isIaqChildNativeId(mac + NATIVE_HUMIDIFIER)).toBe(true);
        expect(isIaqChildNativeId(mac + NATIVE_DEHUMIDIFIER)).toBe(true);
        expect(isIaqChildNativeId(mac)).toBe(false);
        expect(isIaqChildNativeId(mac + NATIVE_OUTDOOR)).toBe(false);

        expect(isAuxTemperatureNativeId(mac + NATIVE_RAT)).toBe(true);
        expect(isAuxTemperatureNativeId(mac + NATIVE_LAT)).toBe(true);
        expect(isAuxTemperatureNativeId(mac + NATIVE_REMOTE)).toBe(true);
        expect(isAuxTemperatureNativeId(mac + NATIVE_OUTDOOR)).toBe(false);
        expect(isAuxTemperatureNativeId(mac + NATIVE_HUMIDIFIER)).toBe(false);
    });
});
