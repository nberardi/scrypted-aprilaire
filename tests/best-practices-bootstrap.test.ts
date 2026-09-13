/**
 * Connect-time bootstrap against Best Practices: COS write, DateAndTime, Sync.
 */
import { describe, expect, it } from "vitest";
import { CosRequest, SyncRequest } from "../src/FunctionalDomainStatus";
import { DateAndTimeRequest } from "../src/FunctionalDomainSetup";
import {
    Action,
    AprilaireClient,
    FunctionalDomain,
    FunctionalDomainControl,
    FunctionalDomainIdentification,
    FunctionalDomainSetup,
    FunctionalDomainStatus,
} from "../src/AprilaireClient";
import { GuideAttribute, guideEncodeDateAndTime } from "./helpers/guide-reference";

describe("Best practices bootstrap", () => {
    it("Sync write is 2 bytes: start=1 plus reserved", () => {
        const sync = new SyncRequest();
        expect(sync.domain).toBe(FunctionalDomain.Status);
        expect(sync.attribute).toBe(FunctionalDomainStatus.Sync);
        expect(sync.toBuffer()).toEqual(Buffer.from([1, 0]));
    });

    it("COS subscription write is 29 bytes", () => {
        const cos = new CosRequest();
        expect(cos.attribute).toBe(FunctionalDomainStatus.COS);
        expect(cos.toBuffer().length).toBe(29);
        expect(cos.toBuffer()[0]).toBe(1);
    });

    it("identification attributes are MAC=2, Revision=1, Name=0x05", () => {
        expect(FunctionalDomainIdentification.MacAddress).toBe(GuideAttribute.Identification.MacAddress);
        expect(FunctionalDomainIdentification.RevisionAndModel).toBe(GuideAttribute.Identification.RevisionAndModel);
        expect(FunctionalDomainIdentification.ThermostatName).toBe(0x05);
        expect(FunctionalDomainControl.ThermostatAndIAQAvailable).toBe(
            GuideAttribute.Control.ThermostatAndIAQAvailable
        );
        expect(Action.ReadRequest).toBe(2);
    });

    it("DateAndTime write uses local wall time on Setup attribute 0x04", () => {
        const local = new Date(2026, 6, 18, 14, 30, 45);
        const req = DateAndTimeRequest.fromLocalDate(local);
        expect(req.domain).toBe(FunctionalDomain.Setup);
        expect(req.attribute).toBe(FunctionalDomainSetup.DateAndTime);
        expect(req.toBuffer()).toEqual(guideEncodeDateAndTime(local));
        expect(req.toBuffer()).toEqual(Buffer.from([45, 30, 14, 18, 6, 7, 26]));
    });

    it("DateAndTime resync interval fits in a 32-bit signed timer delay", () => {
        expect(AprilaireClient.DATE_TIME_RESYNC_MS).toBeLessThanOrEqual(
            AprilaireClient.MAX_TIMER_DELAY_MS
        );
        expect(AprilaireClient.DATE_TIME_RESYNC_MS).toBeGreaterThan(24 * 60 * 60 * 1000);
        expect(AprilaireClient.DATE_TIME_RESYNC_MS).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);
    });
});
