import { describe, expect, it } from "vitest";
import type { CircuitDocument } from "@cs/model";
import {
  CURRENT_FORMAT_VERSION,
  FormatError,
  SHARE_LINK_WARN_LENGTH,
  UNKNOWN_PLACEHOLDER,
  decodeShareLink,
  emptyDocument,
  encodeShareLink,
  isShareLinkTooLong,
  makeLane,
  makeProbe,
  parseCircuit,
  runMigrations,
  serializeCircuit,
  base64urlDecode,
  base64urlEncode,
} from "@cs/formats";

function rcDoc(): CircuitDocument {
  const doc = emptyDocument("RC charging");
  doc.meta.description = "Close S1 and watch C1 charge.";
  const part = (id: string, type: string, label: string, x: number, y: number, rot: 0 | 90, props = {}) => ({
    id,
    type,
    label,
    at: { x, y },
    orientation: { rot, flip: false },
    props,
  });
  doc.parts = {
    p1: part("p1", "battery", "V1", 0, 0, 90, { voltage: 10 }),
    p2: part("p2", "switch", "S1", 0, -4, 0, { closed: false }),
    p3: part("p3", "resistor", "R1", 4, -4, 0, { resistance: 10000 }),
    p4: { ...part("p4", "capacitor", "C1", 8, -4, 90, { capacitance: 0.0001 }), length: 4, savedState: [1.5] },
    p5: part("p5", "ground", "", 0, 4, 0),
  };
  doc.wires = { w1: { id: "w1", points: [{ x: 0, y: 0 }, { x: 0, y: 4 }] } };
  doc.lanes = [makeLane("l1")];
  doc.probes = { r1: makeProbe({ id: "r1", name: "V1", quantity: "voltage", target: { kind: "across", part: "p4" }, lane: "l1" }) };
  doc.view = { center: { x: 4, y: 0 }, zoom: 1 };
  return doc;
}

describe("native circuit file", () => {
  it("round-trips a document", () => {
    const doc = rcDoc();
    const { doc: back, notices } = parseCircuit(serializeCircuit(doc));
    expect(back).toEqual(doc);
    expect(notices).toEqual([]);
  });

  it("writes one part per line in the documented shape", () => {
    const text = serializeCircuit(rcDoc(), { netlistSummary: { V1: ["N1", "GND"], C1: ["N3", "GND"] } });
    const lines = text.split("\n");
    expect(lines.filter((l) => l.includes('"type": ')).length).toBe(5);
    expect(text).toContain('{ "id": "p3", "type": "resistor", "label": "R1", "at": [4, -4], "rot": 0, "props": { "resistance": 10000 } }');
    expect(text).toContain('"V1": ["N1", "GND"]');
    const json = JSON.parse(text);
    expect(json.format).toBe("circuit-simulator");
    expect(json.formatVersion).toBe(CURRENT_FORMAT_VERSION);
    // The netlist section is for readers only and is ignored on load.
    expect(parseCircuit(text).doc).toEqual(rcDoc());
  });

  it("accepts the short hand-written form from the design doc", () => {
    const text = JSON.stringify({
      format: "circuit-simulator",
      formatVersion: 1,
      meta: { title: "t", description: "" },
      settings: { realisticParts: false, realisticRatings: false, start: "zero", seed: 1 },
      parts: [{ id: "p5", type: "ground", label: "", at: [0, 4] }],
      wires: [{ id: "w1", points: [[0, 0], [0, 4]] }],
      probes: [{ id: "r1", name: "V1", quantity: "voltage", target: { kind: "across", part: "p5" }, lane: "l1" }],
      lanes: [{ id: "l1", kind: "analog" }],
    });
    const { doc } = parseCircuit(text);
    expect(doc.parts.p5).toMatchObject({ at: { x: 0, y: 4 }, orientation: { rot: 0, flip: false }, props: {} });
    expect(doc.probes.r1.style.color).toBe("probe.1");
    expect(doc.view).toEqual({ center: { x: 0, y: 0 }, zoom: 1 });
  });

  it("keeps unknown part types as placeholders and writes them back unchanged", () => {
    const text = serializeCircuit(rcDoc()).replace('"type": "switch"', '"type": "flux-capacitor"');
    const { doc, notices } = parseCircuit(text, { isKnownType: (t) => t !== "flux-capacitor" });
    expect(doc.parts.p2.type).toBe(UNKNOWN_PLACEHOLDER);
    expect(notices).toContainEqual({ key: "file.unknownParts", values: { count: 1, types: "flux-capacitor" } });
    const again = JSON.parse(serializeCircuit(doc));
    expect(again.parts[1]).toEqual(JSON.parse(text).parts[1]);
  });

  it("opens newer versions with a notice", () => {
    const text = serializeCircuit(rcDoc()).replace('"formatVersion": 1', '"formatVersion": 7');
    const { doc, notices } = parseCircuit(text);
    expect(notices[0]).toEqual({ key: "file.newerVersion", values: { version: 7, current: CURRENT_FORMAT_VERSION } });
    expect(doc.parts.p3.props.resistance).toBe(10000);
  });

  it("runs a migration chain", () => {
    const chain = [
      { from: 1, to: 2, migrate: (f: any) => ({ ...f, a: 1 }) },
      { from: 2, to: 3, migrate: (f: any) => ({ ...f, b: f.a + 1 }) },
    ];
    const { file, notices } = runMigrations({ formatVersion: 1 }, 3, chain);
    expect(file).toEqual({ formatVersion: 3, a: 1, b: 2 });
    expect(notices).toEqual([{ key: "file.migrated", values: { from: 1, to: 3 } }]);
    expect(runMigrations({ formatVersion: 1 }, 4, chain).notices[0].key).toBe("file.noMigration");
  });

  it("rejects text that is not a circuit", () => {
    expect(() => parseCircuit("nope")).toThrow(FormatError);
    expect(() => parseCircuit('{"format":"other","formatVersion":1}')).toThrow(FormatError);
  });

  it("matches the published JSON Schema's required keys", async () => {
    // A computed specifier keeps node:fs out of the browser type check.
    const fs = "node:fs";
    const { readFileSync } = await import(/* @vite-ignore */ fs);
    const schema = JSON.parse(readFileSync(new URL("../src/schema/circuit-v1.schema.json", import.meta.url), "utf8"));
    const json = JSON.parse(serializeCircuit(rcDoc(), { netlistSummary: { R1: ["N1", "N2"] } }));
    for (const k of schema.required) expect(json).toHaveProperty(k);
    for (const k of Object.keys(json)) expect(schema.properties).toHaveProperty(k);
    for (const k of Object.keys(json.parts[0])) expect(schema.$defs.part.properties).toHaveProperty(k);
  });
});

describe("share links", () => {
  it("round-trips through deflate-raw and base64url", async () => {
    const doc = rcDoc();
    const payload = await encodeShareLink(doc);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeShareLink(payload)).toEqual(doc);
    expect(await decodeShareLink(`#c=${payload}`)).toEqual(doc);
    expect(await decodeShareLink(`https://example.org/simulator/#c=${payload}`)).toEqual(doc);
    expect(await decodeShareLink(`https://example.org/simulator/?embed=1&c=${payload}`)).toEqual(doc);
    expect(isShareLinkTooLong(payload)).toBe(false);
    expect(isShareLinkTooLong("x".repeat(SHARE_LINK_WARN_LENGTH))).toBe(true);
  });

  it("rejects a corrupt payload", async () => {
    await expect(decodeShareLink("#c=AAAA")).rejects.toThrow();
  });

  it("encodes base64url for every length", () => {
    for (let n = 0; n < 20; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes);
    }
    expect(base64urlEncode(new TextEncoder().encode("hi?>"))).toBe("aGk_Pg");
  });
});
