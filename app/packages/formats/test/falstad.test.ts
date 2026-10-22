import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_TYPE,
  decompressLz,
  importFalstad,
  parseCircuit,
  parseFalstadText,
  readFalstadLink,
  serializeCircuit,
  unescapeFalstad,
} from "@cs/formats";
import { getDescriptor } from "@cs/elements";
import { CAP_TXT, LRC_TXT, OHMS_TXT } from "./fixtures";
import { compressLz } from "./lzCompress";

const byType = (doc: ReturnType<typeof importFalstad>["doc"], type: string) =>
  Object.values(doc.parts).filter((p) => p.type === type);

describe("Falstad text parser", () => {
  it("reads settings, elements, scopes, sliders, and hints of lrc.txt", () => {
    const fc = parseFalstadText(LRC_TXT);
    expect(fc.settings).toMatchObject({ flags: 1, timeStep: 5e-6, currentSpeed: 50, voltageRange: 5, minTimeStep: 5e-11 });
    expect(fc.elements.map((e) => e.code)).toEqual(["r", "s", "w", "c", "l", "v", "r"]);
    expect(fc.elements[3]).toMatchObject({ x1: 384, y1: 352, x2: 176, y2: 352, flags: 0, params: ["0.000015", "-9.86", "-10"] });
    expect(fc.scopes.map((s) => s.element)).toEqual([4, 3, 0]);
    expect(fc.scopes[0].flags).toBe(4099);
    expect(fc.sliders.map((s) => [s.element, s.editItem, s.min, s.max, s.text])).toEqual([
      [3, 0, 0.000001, 0.000101, "Capacitance"],
      [4, 0, 0.01, 1.01, "Inductance"],
      [0, 0, 1, 101, "Resistance"],
    ]);
    expect(fc.hints).toEqual([{ type: 1, item1: 4, item2: 3 }]);
    expect(fc.errors).toEqual([]);
  });

  it("reads numeric type codes and the old '&' slider form", () => {
    const fc = parseFalstadText(CAP_TXT + "\n162 0 0 32 0 2 default-led 0 1 0\n");
    expect(fc.sliders[0]).toMatchObject({ element: 5, editItem: 0, text: "Capacitance" });
    expect(fc.elements.at(-1)?.code).toBe("162");
  });

  it("unescapes Falstad text", () => {
    expect(unescapeFalstad("a\\sb\\pc\\\\d")).toBe("a b+c\\d");
    expect(unescapeFalstad("\\0")).toBe("");
  });
});

describe("Falstad mapper", () => {
  it("imports lrc.txt with geometry, props, sliders, scopes, and hint", () => {
    const { doc, report } = importFalstad(LRC_TXT);
    expect(report.unsupported).toEqual([]);
    expect(report.gridPixels).toBe(16);

    const [r1, r2] = byType(doc, "resistor");
    expect(r1).toMatchObject({ label: "R1", at: { x: 11, y: 5 }, orientation: { rot: 0 }, length: 13, props: { resistance: 10 } });
    expect(r2.props.resistance).toBe(100);

    const [c] = byType(doc, "capacitor");
    expect(c).toMatchObject({
      label: "C1",
      at: { x: 24, y: 22 },
      orientation: { rot: 180 },
      length: 13,
      props: { capacitance: 0.000015, initialVoltage: -10 },
      savedState: [-9.86, 0, 0],
    });
    const [l] = byType(doc, "inductor");
    expect(l).toMatchObject({ orientation: { rot: 90 }, length: 17, props: { inductance: 1, initialCurrent: 0 }, savedState: [0.03, 0, 0] });
    const [v] = byType(doc, "battery");
    // Falstad puts the negative end first; our battery has "+" as terminal 0.
    expect(v).toMatchObject({ at: { x: 28, y: 5 }, orientation: { rot: 90 }, length: 17, props: { voltage: 5 } });
    expect(byType(doc, "switch")[0].props.closed).toBe(false);

    expect(Object.values(doc.wires).map((w) => w.points)).toEqual([[{ x: 11, y: 5 }, { x: 11, y: 22 }]]);
    expect(doc.settings.maxTimeStep).toBeUndefined();

    const sliders = Object.values(doc.sliders);
    expect(sliders.map((s) => [doc.parts[s.part].label, s.prop])).toEqual([
      ["C1", "capacitance"],
      ["L1", "inductance"],
      ["R1", "resistance"],
    ]);
    expect(Object.values(doc.probes).map((p) => p.name)).toEqual(["V(L1)", "V(C1)", "V(R1)"]);
    expect(doc.lanes).toHaveLength(3);
    expect(doc.meta.description).toBe("Resonant frequency of L1 and C1");
  });

  it("imports cap.txt with its double-throw switch", () => {
    const { doc, report } = importFalstad(CAP_TXT);
    expect(report.unsupported).toEqual([]);
    const [sw] = byType(doc, "spdt-switch");
    expect(sw.props).toEqual({ thrown: false, momentary: false });
    expect(sw.length).toBe(5);
    expect(byType(doc, "capacitor")[0].props.capacitance).toBeCloseTo(2e-4, 12);
    expect(Object.values(doc.sliders)[0].prop).toBe("capacitance");
    expect(doc.meta.description).toBe("Time constant of R1 and C1");
  });

  it("maps ground symbols, wires, AC sources, text, and unknown codes", () => {
    const text = [
      "$ 1 0.000005 10 50 5 50",
      "v 0 64 0 0 0 1 60 2 0.5 0 0.5",
      "g 0 64 0 80 0",
      "w 0 0 32 32 0",
      "x 64 0 128 16 4 24 Hello\\sworld",
      "Z 0 0 16 0 0 1 2 3",
      "this is not a circuit line",
    ].join("\n");
    const { doc, report } = importFalstad(text);
    const [ac] = byType(doc, "ac-source");
    expect(ac.props).toEqual({ amplitude: 2, frequency: 60, offset: 0.5, phase: 0 });
    const [g] = byType(doc, "ground");
    expect(g).toMatchObject({ at: { x: 0, y: 4 }, orientation: { rot: 90 }, label: "" });
    expect(g.length).toBeUndefined();
    expect(Object.values(doc.wires)[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ]);
    expect(Object.values(doc.annotations)[0]).toMatchObject({ at: { x: 4, y: 0 }, text: "Hello world" });
    expect(report.unsupported.map((u) => u.code)).toEqual(["Z"]);
    expect(report.ignored.map((i) => i.line)).toEqual([7]);
  });

  it("only writes prop keys the element descriptors define", () => {
    const text = [
      LRC_TXT,
      "v 0 0 0 64 8 0 40 5 0 0 0.5",
      "v 0 0 0 64 0 2 100 3 1 0 0.25",
      "i 0 0 64 0 0 0.01 20",
      "s 0 0 64 0 0 1 true",
      "174 0 0 64 0 1 1000 0.3 Resistance",
      "d 0 0 64 0 2 default",
      "162 0 0 64 0 2 default-led 0 1 0 0.02",
      "181 0 0 64 0 0 300 100 120 0.4 0.4",
      "370 0 0 64 0 1 0 0",
      "p 0 0 64 0 1 0 0 0",
      "g 0 0 0 16 0",
    ].join("\n");
    const { doc, report } = importFalstad(text);
    expect(report.unsupported).toEqual([]);
    for (const p of Object.values(doc.parts)) {
      const d = getDescriptor(p.type);
      expect(d, p.type).toBeDefined();
      const keys = d!.props.map((x) => x.key);
      for (const k of Object.keys(p.props)) expect(keys, `${p.type}.${k}`).toContain(k);
    }
    const sq = Object.values(doc.parts).find((p) => p.type === "square-source")!;
    expect(sq.props).toMatchObject({ dutyCycle: 25, amplitude: 3, frequency: 100, offset: 1 });
    expect(Object.values(doc.parts).find((p) => p.type === "dc-source")).toBeDefined();
    expect(Object.values(doc.parts).find((p) => p.type === "push-button")!.props.pressed).toBe(false);
    expect(Object.values(doc.parts).find((p) => p.type === "led")!.props).toEqual({ color: "green", fullBrightnessCurrent: 0.02 });
    expect(Object.values(doc.parts).find((p) => p.type === "lamp")!.props).toEqual({ ratedVoltage: 120, ratedPower: 100 });
    expect(Object.values(doc.parts).find((p) => p.type === "potentiometer")!.length).toBe(4); // stretchable: Falstad length
  });

  it("imports ohms.txt (ground, variable rail with its slider)", () => {
    const { doc, report } = importFalstad(OHMS_TXT);
    expect(byType(doc, "ground")).toHaveLength(2);
    expect(report.unsupported).toEqual([]);
    const [rail] = byType(doc, "rail");
    expect(rail.props.waveform).toBe("dc");
    expect(Object.values(doc.sliders).find((s) => s.part === rail.id)).toMatchObject({ prop: "voltage" });
  });

  it("produces a document that survives the native file round trip", () => {
    const { doc } = importFalstad(LRC_TXT);
    expect(parseCircuit(serializeCircuit(doc)).doc).toEqual(doc);
  });
});

describe("Falstad links", () => {
  it("decompresses lz-string ctz payloads", () => {
    for (const s of [LRC_TXT, CAP_TXT, "a", "aaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Ω µF ünïcödé"]) {
      expect(decompressLz(compressLz(s))).toBe(s);
    }
    expect(decompressLz("")).toBeNull();
  });

  it("reads ctz, cct, and startCircuit parameters", () => {
    const ctz = compressLz(LRC_TXT);
    const got = readFalstadLink(`https://www.falstad.com/circuit/circuitjs.html?ctz=${ctz}`);
    expect(got).toEqual({ kind: "text", text: LRC_TXT });
    expect(importFalstad((got as { text: string }).text).doc.parts.p1.type).toBe("resistor");
    expect(readFalstadLink("?cct=" + encodeURIComponent("$ 1 5e-6 10 50 5\n"))).toEqual({ kind: "text", text: "$ 1 5e-6 10 50 5\n" });
    expect(readFalstadLink("?startCircuit=lrc.txt")).toEqual({ kind: "example", file: "lrc.txt" });
    expect(readFalstadLink("?foo=1")).toBeNull();
  });
});
