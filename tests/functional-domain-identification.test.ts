/**
 * Functional Domain: Identification (0x08)
 *
 * Priority list: P0 Thermostat Name attribute 0x05
 */
import { describe, expect, it } from "vitest";
import {
    ForceConnectionType,
    HVACAutomationSetting,
    MacAddressResponse,
    RevisionAndModelResponse,
    sanitizeIdentificationText,
    ThermostatNameResponse,
} from "../src/FunctionalDomainIdentification";
import {
    FunctionalDomain,
    FunctionalDomainIdentification,
} from "../src/AprilaireClient";
import { GuideAttribute, GuideDomain } from "./helpers/guide-reference";

describe("Identification domainx", () => {
    describe(" Revision & Model", () => {
        it("parses hardware, firmware, protocol, model, radio firmware", () => {
            // hardware 'A' (0x41), fw 1.4, protocol 1, model 8840 (7), radio 4.1
            const payload = Buffer.from([
                0x41, // 'A'
                1, // major fw
                4, // minor fw
                1, // protocol major
                7, // 8840
                4, // gainspan major
                1, // gainspan minor
            ]);
            const res = new RevisionAndModelResponse(payload);
            expect(res.domain).toBe(FunctionalDomain.Identification);
            expect(res.attribute).toBe(GuideAttribute.Identification.RevisionAndModel);
            expect(res.hardware).toBe("A");
            expect(res.firmwareMajor).toBe(1);
            expect(res.firmwareMinor).toBe(4);
            expect(res.protocolMajor).toBe(1);
            expect(res.model).toBe("8840");
            expect(res.gainspanFirmwareMajor).toBe(4);
            expect(res.gainspanFirmwareMinor).toBe(1);
        });

        it("maps guide model numbers 0–7", () => {
            const models: Array<[number, string]> = [
                [0, "8476W"],
                [1, "8810"],
                [2, "8620W"],
                [3, "8820"],
                [4, "8910W"],
                [5, "8830"],
                [6, "8920W"],
                [7, "8840"],
            ];
            for (const [byte, name] of models) {
                const payload = Buffer.from([0x31, 1, 0, 1, byte, 0, 0]);
                expect(new RevisionAndModelResponse(payload).model).toBe(name);
            }
        });

        it("maps extended models used in field (field extensions)", () => {
            // Documented by community / pyaprilaire — keep for regression
            expect(new RevisionAndModelResponse(Buffer.from([0x41, 1, 0, 1, 14, 0, 0])).model).toBe(
                "8840M"
            );
            expect(new RevisionAndModelResponse(Buffer.from([0x41, 1, 0, 1, 28, 0, 0])).model).toBe(
                "6003"
            );
        });
    });

    describe(" MAC Address", () => {
        it("parses 6 MAC octets plus force connection and HVAC/Automation setting", () => {
            const payload = Buffer.from([
                0xb4, 0x82, 0x55, 0xa5, 0x01, 0x07, // MAC
                ForceConnectionType.NoAlertsOrReminders,
                HVACAutomationSetting.Automation,
            ]);
            const res = new MacAddressResponse(payload);
            expect(res.attribute).toBe(GuideAttribute.Identification.MacAddress);
            expect(res.macAddress).toBe("b48255a50107");
            expect(res.forceConnection).toBe(ForceConnectionType.NoAlertsOrReminders);
            expect(res.setting).toBe(HVACAutomationSetting.Automation);
        });
    });

    describe(" Thermostat Name ", () => {
        it("uses attribute 0x05attribute table", () => {
            // Constructing the response uses the enum; enum must be 0x05
            expect(FunctionalDomainIdentification.ThermostatName).toBe(
                GuideAttribute.Identification.ThermostatName
            );
            expect(FunctionalDomainIdentification.ThermostatName).toBe(0x05);
        });

        it("parses postal/location (7 chars + null) and name (15 chars + null)", () => {
            // Layout per protocol / pyaprilaire: 7 text + null + 15 text + null
            const postal = Buffer.from("12345\0\0", "ascii"); // 7 bytes
            const name = Buffer.from("Living Room\0\0\0\0", "ascii"); // 15 bytes
            // Ensure exact lengths
            const postal7 = Buffer.alloc(7);
            postal.copy(postal7);
            const name15 = Buffer.alloc(15);
            name.copy(name15);
            const payload = Buffer.concat([postal7, Buffer.from([0]), name15, Buffer.from([0])]);

            const res = new ThermostatNameResponse(payload);
            expect(res.attribute).toBe(GuideAttribute.Identification.ThermostatName);
            expect(res.domain).toBe(GuideDomain.Identification);
            expect(res.postalCode).toBe("12345");
            expect(res.name).toBe("Living Room");
        });

        it("sanitizeIdentificationText strips NULs and control characters", () => {
            expect(sanitizeIdentificationText("Main Floor\0\0\0")).toBe("Main Floor");
            expect(sanitizeIdentificationText(Buffer.alloc(15, 0))).toBe("");
            expect(sanitizeIdentificationText("  Upstairs  ")).toBe("Upstairs");
        });
    });
});
