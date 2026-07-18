/**
 * TCP frame reassembly (issue #17)
 *
 * Sticky buffer across TCP `data` events: split frames, coalesced frames,
 * incomplete remainder retention, and CRC-failure drop strategy.
 */
import { describe, expect, it } from "vitest";
import {
    Action,
    FunctionalDomain,
    FunctionalDomainControl,
    FunctionalDomainIdentification,
    FunctionalDomainSensors,
    NAckError,
    generateCrc,
    reassembleFrames,
    type ReassembledFrame,
} from "../src/AprilaireClient";
import { convertTemperatureToByte } from "../src/AprilaireClient";

/**
 * Build a wire-valid Aprilaire frame with production CRC.
 * Layout: REV SEQ CNT_BE(2) ACTION DOMAIN ATTR [data...] CRC
 */
function buildFrame(options: {
    revision?: number;
    sequence: number;
    action: Action;
    domain: FunctionalDomain;
    attribute: number;
    data?: Buffer;
}): Buffer {
    const revision = options.revision ?? 1;
    const data = options.data ?? Buffer.alloc(0);
    const header = Buffer.alloc(7);
    header.writeUint8(revision, 0);
    header.writeUint8(options.sequence, 1);
    header.writeUint16BE(3 + data.byteLength, 2);
    header.writeUint8(options.action, 4);
    header.writeUint8(options.domain, 5);
    header.writeUint8(options.attribute, 6);

    const body = Buffer.concat([header, data]);
    const crc = generateCrc(body);
    const frame = Buffer.alloc(body.byteLength + 1);
    body.copy(frame, 0);
    frame.writeUint8(crc, frame.byteLength - 1);
    return frame;
}

/**
 * Build a wire-valid NACK frame (CNT=2): REV SEQ 00 02 ACTION STATUS CRC
 */
function buildNackFrame(options: {
    revision?: number;
    sequence: number;
    status: number;
}): Buffer {
    const revision = options.revision ?? 1;
    const body = Buffer.alloc(6);
    body.writeUint8(revision, 0);
    body.writeUint8(options.sequence, 1);
    body.writeUint16BE(2, 2);
    body.writeUint8(Action.NAck, 4);
    body.writeUint8(options.status, 5);
    const crc = generateCrc(body);
    const frame = Buffer.alloc(7);
    body.copy(frame, 0);
    frame.writeUint8(crc, 6);
    return frame;
}

/** Corrupt the CRC byte of an otherwise valid frame. */
function corruptCrc(frame: Buffer): Buffer {
    const bad = Buffer.from(frame);
    bad[bad.length - 1] = (bad[bad.length - 1] + 1) & 0xff;
    return bad;
}

function setpointPayload(mode: number, fan: number, heatC: number, coolC: number): Buffer {
    return Buffer.from([
        mode,
        fan,
        convertTemperatureToByte(heatC),
        convertTemperatureToByte(coolC),
    ]);
}

describe("TCP frame reassembly (issue #17)", () => {
    const macData = Buffer.from([0xb4, 0x82, 0x55, 0x01, 0x02, 0x03, 0, 1]);

    const macFrame = buildFrame({
        sequence: 10,
        action: Action.ReadResponse,
        domain: FunctionalDomain.Identification,
        attribute: FunctionalDomainIdentification.MacAddress,
        data: macData,
    });

    const setpointFrame = buildFrame({
        sequence: 11,
        action: Action.ReadResponse,
        domain: FunctionalDomain.Control,
        attribute: FunctionalDomainControl.ThermstateSetpointAndModeSettings,
        data: setpointPayload(2, 2, 20, 24),
    });

    const sensorFrame = buildFrame({
        sequence: 200,
        action: Action.COS,
        domain: FunctionalDomain.Sensors,
        attribute: FunctionalDomainSensors.ControllingSensorValues,
        data: Buffer.from([
            0,
            convertTemperatureToByte(21.5),
            0,
            convertTemperatureToByte(10),
            0,
            40,
            3,
            0,
        ]),
    });

    describe("fixture integrity", () => {
        it("builds frames whose CRC matches production generateCrc over body", () => {
            // Independent check: recompute CRC from body bytes only.
            const body = macFrame.subarray(0, macFrame.length - 1);
            expect(generateCrc(body)).toBe(macFrame[macFrame.length - 1]);
            expect(macFrame.length).toBe(4 + macFrame.readUint16BE(2) + 1);
        });

        it("builds NACK frames with CNT=2 and valid CRC", () => {
            const nack = buildNackFrame({ sequence: 5, status: NAckError.WriteValueOutOfRange });
            expect(nack.length).toBe(7);
            expect(nack.readUint16BE(2)).toBe(2);
            expect(nack[4]).toBe(Action.NAck);
            expect(generateCrc(nack.subarray(0, 6))).toBe(nack[6]);
        });
    });

    describe("single complete frame", () => {
        it("parses one full frame from a single buffer", () => {
            const result = reassembleFrames(macFrame);
            expect(result.crcFailures).toBe(0);
            expect(result.remainder.length).toBe(0);
            expect(result.frames).toHaveLength(1);

            const f = result.frames[0];
            expect(f.action).toBe(Action.ReadResponse);
            expect(f.domain).toBe(FunctionalDomain.Identification);
            expect(f.attribute).toBe(FunctionalDomainIdentification.MacAddress);
            expect(f.sequence).toBe(10);
            expect(f.payload.equals(macData)).toBe(true);
            expect(f.crc).toBe(macFrame[macFrame.length - 1]);
        });
    });

    describe("sticky buffer across appends (split frame)", () => {
        it("yields nothing until the full frame arrives across two chunks", () => {
            // Split mid-payload: header (7) + half data, then rest + CRC.
            const splitAt = Math.floor(macFrame.length / 2);
            expect(splitAt).toBeGreaterThan(4);
            expect(splitAt).toBeLessThan(macFrame.length);

            const first = macFrame.subarray(0, splitAt);
            const second = macFrame.subarray(splitAt);

            // First append: incomplete — no frames, remainder is sticky bytes.
            const mid = reassembleFrames(first);
            expect(mid.frames).toHaveLength(0);
            expect(mid.crcFailures).toBe(0);
            expect(mid.remainder.equals(first)).toBe(true);
            expect(mid.remainder.length).toBe(splitAt);

            // Second append: sticky first + second completes exactly one frame.
            const combined = Buffer.concat([mid.remainder, second]);
            expect(combined.equals(macFrame)).toBe(true);

            const done = reassembleFrames(combined);
            expect(done.frames).toHaveLength(1);
            expect(done.remainder.length).toBe(0);
            expect(done.frames[0].payload.equals(macData)).toBe(true);
            expect(done.frames[0].sequence).toBe(10);
        });

        it("reassembles when split after only 3 header bytes (before CNT fully readable)", () => {
            const first = macFrame.subarray(0, 3);
            const second = macFrame.subarray(3);

            const mid = reassembleFrames(first);
            expect(mid.frames).toHaveLength(0);
            expect(mid.remainder.length).toBe(3);

            const done = reassembleFrames(Buffer.concat([mid.remainder, second]));
            expect(done.frames).toHaveLength(1);
            expect(done.frames[0].domain).toBe(FunctionalDomain.Identification);
            expect(done.remainder.length).toBe(0);
        });

        it("reassembles a three-way split of a longer setpoint frame", () => {
            const a = setpointFrame.subarray(0, 5);
            const b = setpointFrame.subarray(5, 9);
            const c = setpointFrame.subarray(9);

            let buf = Buffer.alloc(0);
            let frames: ReassembledFrame[] = [];

            for (const chunk of [a, b, c]) {
                buf = Buffer.concat([buf, chunk]);
                const r = reassembleFrames(buf);
                frames = frames.concat(r.frames);
                buf = r.remainder;
            }

            expect(frames).toHaveLength(1);
            expect(buf.length).toBe(0);
            expect(frames[0].action).toBe(Action.ReadResponse);
            expect(frames[0].domain).toBe(FunctionalDomain.Control);
            expect(frames[0].attribute).toBe(
                FunctionalDomainControl.ThermstateSetpointAndModeSettings
            );
            expect(frames[0].payload[0]).toBe(2); // heat mode
            expect(frames[0].payload.length).toBe(4);
        });
    });

    describe("coalesced frames in one chunk", () => {
        it("extracts two complete frames from a single buffer", () => {
            const chunk = Buffer.concat([macFrame, setpointFrame]);
            const result = reassembleFrames(chunk);

            expect(result.crcFailures).toBe(0);
            expect(result.remainder.length).toBe(0);
            expect(result.frames).toHaveLength(2);

            expect(result.frames[0].domain).toBe(FunctionalDomain.Identification);
            expect(result.frames[0].sequence).toBe(10);
            expect(result.frames[0].payload.equals(macData)).toBe(true);

            expect(result.frames[1].domain).toBe(FunctionalDomain.Control);
            expect(result.frames[1].sequence).toBe(11);
            expect(result.frames[1].payload.length).toBe(4);
        });

        it("extracts three coalesced frames including COS", () => {
            const chunk = Buffer.concat([macFrame, setpointFrame, sensorFrame]);
            const result = reassembleFrames(chunk);

            expect(result.frames).toHaveLength(3);
            expect(result.remainder.length).toBe(0);
            expect(result.frames[2].action).toBe(Action.COS);
            expect(result.frames[2].domain).toBe(FunctionalDomain.Sensors);
            expect(result.frames[2].sequence).toBe(200);
        });
    });

    describe("incomplete trailing remainder", () => {
        it("retains a partial second frame after a complete first frame", () => {
            const partial = setpointFrame.subarray(0, 6);
            const chunk = Buffer.concat([macFrame, partial]);

            const result = reassembleFrames(chunk);
            expect(result.frames).toHaveLength(1);
            expect(result.frames[0].domain).toBe(FunctionalDomain.Identification);
            // Remainder must be exactly the incomplete second frame prefix (not lost).
            expect(result.remainder.equals(partial)).toBe(true);
            expect(result.remainder.length).toBe(6);
        });

        it("completes the retained remainder on a subsequent append", () => {
            const partial = setpointFrame.subarray(0, 6);
            const rest = setpointFrame.subarray(6);

            const firstPass = reassembleFrames(Buffer.concat([macFrame, partial]));
            expect(firstPass.frames).toHaveLength(1);
            expect(firstPass.remainder.length).toBe(6);

            const secondPass = reassembleFrames(Buffer.concat([firstPass.remainder, rest]));
            expect(secondPass.frames).toHaveLength(1);
            expect(secondPass.remainder.length).toBe(0);
            expect(secondPass.frames[0].sequence).toBe(11);
            expect(secondPass.frames[0].domain).toBe(FunctionalDomain.Control);
        });

        it("returns empty frames and empty remainder for empty input", () => {
            const result = reassembleFrames(Buffer.alloc(0));
            expect(result.frames).toHaveLength(0);
            expect(result.remainder.length).toBe(0);
            expect(result.crcFailures).toBe(0);
        });
    });

    describe("CRC failure strategy", () => {
        // Documented strategy: drop the bad candidate's full span (4+length+1)
        // and continue. Do not accept the frame. Subsequent valid frames recover.

        it("drops a CRC-corrupt frame and does not return it", () => {
            const bad = corruptCrc(macFrame);
            // Prove corruption is real (independent of reassembly).
            expect(generateCrc(bad.subarray(0, bad.length - 1))).not.toBe(bad[bad.length - 1]);

            const result = reassembleFrames(bad);
            expect(result.frames).toHaveLength(0);
            expect(result.crcFailures).toBe(1);
            expect(result.remainder.length).toBe(0);
        });

        it("drops a bad frame then recovers the following valid frame", () => {
            const bad = corruptCrc(macFrame);
            const chunk = Buffer.concat([bad, setpointFrame]);

            const result = reassembleFrames(chunk);
            expect(result.crcFailures).toBe(1);
            expect(result.frames).toHaveLength(1);
            expect(result.remainder.length).toBe(0);
            // Only the valid second frame is returned.
            expect(result.frames[0].sequence).toBe(11);
            expect(result.frames[0].domain).toBe(FunctionalDomain.Control);
            expect(result.frames[0].payload[0]).toBe(2);
        });

        it("recovers a valid frame after a bad NACK candidate", () => {
            const badNack = corruptCrc(
                buildNackFrame({ sequence: 1, status: NAckError.WriteValueOutOfRange })
            );
            const good = macFrame;
            const result = reassembleFrames(Buffer.concat([badNack, good]));

            expect(result.crcFailures).toBe(1);
            expect(result.frames).toHaveLength(1);
            expect(result.frames[0].domain).toBe(FunctionalDomain.Identification);
            expect(result.frames[0].payload.equals(macData)).toBe(true);
        });

        it("counts multiple consecutive CRC failures independently", () => {
            const bad1 = corruptCrc(macFrame);
            const bad2 = corruptCrc(setpointFrame);
            const good = sensorFrame;

            const result = reassembleFrames(Buffer.concat([bad1, bad2, good]));
            expect(result.crcFailures).toBe(2);
            expect(result.frames).toHaveLength(1);
            expect(result.frames[0].sequence).toBe(200);
            expect(result.frames[0].action).toBe(Action.COS);
        });
    });

    describe("NACK frames", () => {
        it("parses a valid NACK into FunctionalDomain.NAck with status attribute", () => {
            const nack = buildNackFrame({
                sequence: 42,
                status: NAckError.WriteValueOutOfRange,
            });
            const result = reassembleFrames(nack);

            expect(result.frames).toHaveLength(1);
            expect(result.crcFailures).toBe(0);
            const f = result.frames[0];
            expect(f.action).toBe(Action.NAck);
            expect(f.domain).toBe(FunctionalDomain.NAck);
            expect(f.attribute).toBe(NAckError.WriteValueOutOfRange);
            expect(f.payload.equals(Buffer.from([NAckError.WriteValueOutOfRange]))).toBe(true);
            expect(f.length).toBe(2);
            expect(f.sequence).toBe(42);
        });

        it("handles NACK coalesced with a following ReadResponse", () => {
            const nack = buildNackFrame({ sequence: 1, status: NAckError.GenericError });
            const result = reassembleFrames(Buffer.concat([nack, macFrame]));

            expect(result.frames).toHaveLength(2);
            expect(result.frames[0].action).toBe(Action.NAck);
            expect(result.frames[1].domain).toBe(FunctionalDomain.Identification);
        });
    });

    describe("simulated multi-chunk sticky session", () => {
        /**
         * Emulates AprilaireSocket receiveBuffer: concat each TCP chunk,
         * parse, keep remainder — the production data-handler pattern.
         */
        function feedChunks(chunks: Buffer[]): {
            frames: ReassembledFrame[];
            remainder: Buffer;
            crcFailures: number;
        } {
            let receiveBuffer = Buffer.alloc(0);
            const frames: ReassembledFrame[] = [];
            let crcFailures = 0;

            for (const chunk of chunks) {
                receiveBuffer = Buffer.concat([receiveBuffer, chunk]);
                const r = reassembleFrames(receiveBuffer);
                frames.push(...r.frames);
                receiveBuffer = r.remainder;
                crcFailures += r.crcFailures;
            }

            return { frames, remainder: receiveBuffer, crcFailures };
        }

        it("handles realistic split-and-coalesce TCP delivery order", () => {
            // Deliver: [mac half] [mac rest + full setpoint] [sensor half] [sensor rest]
            const macMid = Math.floor(macFrame.length / 2);
            const sensorMid = 4; // only REV SEQ CNT_H CNT_L

            const chunks = [
                macFrame.subarray(0, macMid),
                Buffer.concat([macFrame.subarray(macMid), setpointFrame]),
                sensorFrame.subarray(0, sensorMid),
                sensorFrame.subarray(sensorMid),
            ];

            const session = feedChunks(chunks);
            expect(session.crcFailures).toBe(0);
            expect(session.remainder.length).toBe(0);
            expect(session.frames).toHaveLength(3);
            expect(session.frames.map((f) => f.sequence)).toEqual([10, 11, 200]);
            expect(session.frames[0].payload.equals(macData)).toBe(true);
            expect(session.frames[1].domain).toBe(FunctionalDomain.Control);
            expect(session.frames[2].action).toBe(Action.COS);
        });

        it("keeps a trailing partial across session end (not discarded)", () => {
            const partial = macFrame.subarray(0, 8);
            const session = feedChunks([setpointFrame, partial]);

            expect(session.frames).toHaveLength(1);
            expect(session.frames[0].sequence).toBe(11);
            expect(session.remainder.equals(partial)).toBe(true);
        });
    });
});
