/**
 * Temperature encoding, appendix conversion notes.
 *
 * Priority list: P0 — convertTemperatureToByte / convertByteToTemperature
 */
import { describe, expect, it } from "vitest";
import {
    convertByteToTemperature,
    convertTemperatureToByte,
} from "../src/AprilaireClient";
import {
    guideDecodeTemperature,
    guideEncodeTemperature,
} from "./helpers/guide-reference";

describe("Protocol temperature encoding ", () => {
    describe("documented example vectors", () => {
        it("encodes 21.0 °C as 0x15 (protocolheat setpoint example)", () => {
            expect(guideEncodeTemperature(21.0)).toBe(0x15);
            expect(convertTemperatureToByte(21.0)).toBe(0x15);
        });

        it("encodes 26.5 °C as 0x5A (protocolcool setpoint example)", () => {
            expect(guideEncodeTemperature(26.5)).toBe(0x5a);
            expect(convertTemperatureToByte(26.5)).toBe(0x5a);
        });

        it("encodes 21.5 °C as 0x55 (protocol°F indoor example)", () => {
            expect(guideEncodeTemperature(21.5)).toBe(0x55);
            expect(convertTemperatureToByte(21.5)).toBe(0x55);
        });

        it("encodes 43.5 °C as 0x6B (protocolout-of-range example)", () => {
            expect(guideEncodeTemperature(43.5)).toBe(0x6b);
            expect(convertTemperatureToByte(43.5)).toBe(0x6b);
        });

        it("decodes guide example bytes back to Celsius", () => {
            expect(convertByteToTemperature(0x15)).toBe(21.0);
            expect(convertByteToTemperature(0x5a)).toBe(26.5);
            expect(convertByteToTemperature(0x55)).toBe(21.5);
            expect(convertByteToTemperature(0x6b)).toBe(43.5);
        });
    });

    describe("bit layout: sign (bit7) + half-degree (bit6) + magnitude (bits5-0)", () => {
        const cases: Array<{ c: number; note: string }> = [
            { c: 0, note: "zero" },
            { c: 4, note: "min heat range edge" },
            { c: 15.5, note: "away heat default base" },
            { c: 18.5, note: "away heat upper" },
            { c: 26.5, note: "away cool base" },
            { c: 29.5, note: "away cool upper" },
            { c: 32, note: "upper heat edge" },
            { c: -5, note: "negative outdoor" },
            { c: -10.5, note: "negative outdoor half-degree" },
            { c: -40, note: "table lower extreme" },
        ];

        for (const { c, note } of cases) {
            it(`round-trips ${c} °C (${note}) per protocol bit layout`, () => {
                const encoded = guideEncodeTemperature(c);
                expect(guideDecodeTemperature(encoded)).toBe(c);

                // Production must match the protocol reference.
                expect(convertTemperatureToByte(c)).toBe(encoded);
                expect(convertByteToTemperature(encoded)).toBe(c);
            });
        }
    });

    describe("negative temperatures (critical for outdoor / written ODT)", () => {
        it("sets bit 7 for negative values", () => {
            const encoded = convertTemperatureToByte(-10);
            expect(encoded & 0x80).toBe(0x80);
            expect(guideEncodeTemperature(-10) & 0x80).toBe(0x80);
        });

        it("clears bit 7 for positive values", () => {
            expect(convertTemperatureToByte(10) & 0x80).toBe(0);
        });

        it("decodes bit 7 as sign, not bit 1", () => {
            // 0xCA = 128 + 64 + 10 → -10.5 °C when decoded correctly
            const byte = guideEncodeTemperature(-10.5);
            expect(byte).toBe(0xca);
            expect(convertByteToTemperature(byte)).toBe(-10.5);
        });

        it("encodes magnitude with Math.floor(abs(temp)), not Math.floor(temp)", () => {
            // Math.floor(-5.5) === -6 would corrupt the wire value
            expect(convertTemperatureToByte(-5.5)).toBe(guideEncodeTemperature(-5.5));
            expect(convertTemperatureToByte(-5.5)).toBe(0x80 + 0x40 + 5); // -5.5
        });
    });

    describe("half-degree flag (bit 6)", () => {
        it("sets bit 6 when fractional part >= 0.5", () => {
            expect(convertTemperatureToByte(21.5) & 0x40).toBe(0x40);
            expect(convertTemperatureToByte(21.0) & 0x40).toBe(0);
        });

        it("treats 0.4 as whole degree (no half flag)", () => {
            // Implementation detail: current code uses % 1 >= 0.5; document expected wire value
            expect(guideEncodeTemperature(21.4)).toBe(21);
        });
    });

    describe("null / zero convention on write", () => {
        it("uses 0 as Null for setpoints that must not change", () => {
            // Callers must send 0 to leave a field unchanged. Encoding of 0 °C is also 0;
            // that ambiguity is documented in the guide and accepted on the wire.
            expect(guideEncodeTemperature(0)).toBe(0);
            expect(convertTemperatureToByte(0)).toBe(0);
        });
    });
});
