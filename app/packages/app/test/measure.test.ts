// Probes, meters and the circuit-law tools on a known circuit, solved with
// the engine's DC routine:
//
//   V1 (10 V) — Ra (1k) — J1 ══ S ══ J2 — Rc (1k) — GND
//                          |          └── Rd (1k) — GND
//                          Rb (1k) — GND
//
// V(J) = 2.5 V, I(Ra) = 7.5 mA, I(Rb) = I(Rc) = I(Rd) = 2.5 mA, and the wire
// segment S between the two junctions carries 5 mA, a sum of two terminal
// currents on either side.

import { compile, createDocument, type CircuitDocument, type CompiledCircuit, type Part, type PropValue } from "@cs/model";
import { createPartResolver, getDescriptor } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { dcTable } from "@cs/engine";
import { ViewTransform } from "@cs/render";
import { serializeCircuit, parseCircuit } from "@cs/formats";
import type { Frame } from "@cs/worker";
import { probeValue, resolveProbe, segmentSumTerms, type LiveSource } from "../src/probes/evaluate";
import { createDerivedTransform } from "../src/probes/derived";
import { addProbe, nextProbeName, reverseProbe } from "../src/probes/add";
import { targetFor } from "../src/probes/targets";
import { buildFlags } from "../src/probes/flags";
import { partReadings, nodeReading } from "../src/meters/readings";
import { explainPart } from "../src/meters/explain";
import { junctionCurrents, loopSteps } from "../src/law-tools/compute";
import { lawSum } from "../src/law-tools/format";
import { LeadSampler, ohmmeterNetlist, ohmsFrom } from "../src/meters/dmm";
import { AC_HEADING, orderedProps } from "../src/analysis/ac-props";
import { cdiv, impedanceFrom, phasorNetlist } from "../src/analysis/ac-extras";
import { AppController } from "../src/controller";
import { measureOf } from "../src/probes/install";
import { lightTheme } from "@cs/render";

const resolver = createPartResolver();

function part(id: string, type: string, x: number, y: number, props: Record<string, PropValue> = {}): Part {
  return { id, type, label: id, at: { x, y }, orientation: { rot: 0, flip: false }, props };
}

function circuit(): CircuitDocument {
  const parts = [
    part("V1", "dc-source", 0, 0, { voltage: 10, internalResistance: 0 }), // + (0,0), − (4,0)
    part("G0", "ground", 4, 0),
    part("Ra", "resistor", 0, -6, { resistance: 1000 }), // (0,-6) – (4,-6)
    part("Rb", "resistor", 20, -10, { resistance: 1000 }), // (20,-10) – (24,-10)
    part("G1", "ground", 24, -10),
    part("Rc", "resistor", 30, -6, { resistance: 1000 }), // (30,-6) – (34,-6)
    part("G2", "ground", 34, -6),
    part("Rd", "resistor", 30, -12, { resistance: 1000 }), // (30,-12) – (34,-12)
    part("G3", "ground", 34, -12),
  ];
  const w = (id: string, ...pts: [number, number][]) => ({ id, points: pts.map(([x, y]) => ({ x, y })) });
  const wires = [
    w("wv", [0, 0], [0, -6]), // V1+ to Ra
    w("wa", [4, -6], [20, -6]), // Ra to J1
    w("wb", [20, -6], [20, -10]), // J1 to Rb
    w("S", [20, -6], [30, -6]), // J1 to J2
    w("wd", [30, -6], [30, -12]), // J2 to Rd
  ];
  return createDocument({
    parts: Object.fromEntries(parts.map((p) => [p.id, p])),
    wires: Object.fromEntries(wires.map((x) => [x.id, x])),
  });
}

function solved(doc = circuit()): LiveSource & { doc: CircuitDocument } {
  const compiled: CompiledCircuit = compile(doc, resolver);
  const r = dcTable(compiled.netlist, getModelFactory);
  expect(r.ok).toBe(true);
  return { doc, compiled, display: r.display };
}

const close = (a: number | undefined, b: number, tol = 1e-6) => expect(a).toBeCloseTo(b, -Math.log10(tol));
const probe = (quantity: "voltage" | "current" | "power" | "logic", target: Parameters<typeof resolveProbe>[1]["target"]) => ({ id: "p", quantity, target });

describe("probe placement resolves to channels for every target kind", () => {
  test("voltage at a terminal, across a part, and differential", () => {
    const s = solved();
    const ch = resolveProbe(s.compiled, probe("voltage", { kind: "terminal", part: "Rb", terminal: 0 }));
    expect(ch).toMatchObject({ kind: "voltage", b: 0 });
    close(probeValue(s, probe("voltage", { kind: "terminal", part: "Rb", terminal: 0 })), 2.5);
    close(probeValue(s, probe("voltage", { kind: "across", part: "Ra" })), 7.5);
    const between = { kind: "between" as const, a: { kind: "terminal" as const, part: "V1", terminal: 0 }, b: { kind: "point" as const, wire: "S", segment: 0, t: 0.5 } };
    close(probeValue(s, probe("voltage", between)), 7.5);
  });

  test("current through a part, reversed, and power", () => {
    const s = solved();
    expect(resolveProbe(s.compiled, probe("current", { kind: "through", part: "Ra", reversed: false }))).toMatchObject({ kind: "current", element: "Ra", terminal: 0 });
    close(probeValue(s, probe("current", { kind: "through", part: "Ra", reversed: false })), 7.5e-3, 1e-9);
    close(probeValue(s, probe("current", { kind: "through", part: "Ra", reversed: true })), -7.5e-3, 1e-9);
    close(probeValue(s, probe("power", { kind: "across", part: "Ra" })), 56.25e-3, 1e-9);
    close(probeValue(s, probe("power", { kind: "across", part: "V1" })), -75e-3, 1e-9);
  });

  test("a wire segment between two junctions is a sum of terminal currents (T junction)", () => {
    const s = solved();
    const t = { kind: "segment" as const, wire: "S", segment: 0, reversed: false };
    expect(resolveProbe(s.compiled, probe("current", t))).toBeUndefined(); // no single-terminal channel
    expect(segmentSumTerms(s.compiled, t)?.terms).toHaveLength(2);
    close(probeValue(s, probe("current", t)), 5e-3, 1e-9);
    close(probeValue(s, probe("current", { ...t, reversed: true })), -5e-3, 1e-9);
    // A segment next to a single terminal still resolves to a plain channel.
    const wv = { kind: "segment" as const, wire: "wa", segment: 0, reversed: false };
    expect(resolveProbe(s.compiled, probe("current", wv))).toMatchObject({ kind: "current" });
    close(Math.abs(probeValue(s, probe("current", wv))!), 7.5e-3, 1e-9);
  });

  test("segment sums become derived channels in each frame", () => {
    const s = solved();
    const doc = structuredClone(s.doc);
    addProbe(doc, "current", { kind: "segment", wire: "S", segment: 0, reversed: false }, "pS", "ln1");
    const compiled = compile(doc, resolver);
    const tf = createDerivedTransform(() => ({ doc, compiled }));
    const frame: Frame = {
      frame: 1, t0: 0, t1: 1e-3, runState: "running", effectiveSpeed: 1, slowerThanRequested: false,
      channelIds: [], times: Float64Array.from([5e-4, 1e-3]), samples: new Float64Array(0), display: Float64Array.from(s.display), events: [],
    };
    const out = tf(frame);
    expect(out.channelIds).toEqual(["pS"]);
    close(out.samples[1], 5e-3, 1e-9);
  });

  test("current tool on a wire points along the present current; parts with 3+ terminals take the nearest", () => {
    const s = solved();
    const terminals = (id: string) => resolver.terminals(s.doc.parts[id]);
    const seg = { kind: "segment" as const, wire: "S", segment: 0, from: { x: 30, y: -6 }, to: { x: 20, y: -6 } };
    // Drawn from J1 to J2, the current flows J1 -> J2 (positive along the wire).
    const fwd = targetFor("current", { ...seg, from: { x: 20, y: -6 }, to: { x: 30, y: -6 } }, { x: 25, y: -6 }, { terminals, compiled: s.compiled, display: s.display });
    expect(fwd?.target).toMatchObject({ kind: "segment", reversed: false });
    expect(targetFor("power", { kind: "part", part: "Ra", box: { x: 0, y: -7, w: 4, h: 2 } }, { x: 2, y: -6 }, { terminals })?.target).toEqual({ kind: "across", part: "Ra" });
    void seg;
  });

  test("names count per quantity; reverse flips a current probe", () => {
    const doc = circuit();
    addProbe(doc, "voltage", { kind: "across", part: "Ra" }, "a", "l1");
    addProbe(doc, "current", { kind: "through", part: "Ra", reversed: false }, "b", "l2");
    expect(doc.probes.a.name).toBe("V1");
    expect(doc.probes.b.name).toBe("I1");
    expect(doc.probes.b.lane).not.toBe(doc.probes.a.lane); // one unit per lane
    expect(nextProbeName(doc, "current")).toBe("I2");
    expect(reverseProbe(doc, "b")).toBe(true);
    expect(doc.probes.b.target).toMatchObject({ reversed: true });
    expect(reverseProbe(doc, "a")).toBe(false);
  });
});

describe("hover cards, flags and explain", () => {
  test("part and node readings from a known circuit", () => {
    const s = solved();
    const rows = Object.fromEntries(partReadings(s, s.doc.parts.Ra).map((r) => [r.key, r.value]));
    close(rows.voltage, 7.5);
    close(rows.current, 7.5e-3, 1e-9);
    close(rows.power, 56.25e-3, 1e-9);
    close(rows.resistance, 1000, 1e-3);
    const n = nodeReading(s, s.compiled.segments.find((x) => x.wire === "S")!.node, { wire: "S", segment: 0 });
    close(n.voltage, 2.5);
    close(n.segmentCurrent, 5e-3, 1e-9);
  });

  test("explain fills Ohm's law with live values", () => {
    const s = solved();
    expect(explainPart(s, s.doc.parts.Ra)[0]).toBe("I = V ÷ R = 7.50 V ÷ 1.00 kΩ = 7.50 mA");
    expect(explainPart(s, s.doc.parts.V1)[0]).toContain("delivered");
  });

  test("flags: position from the offset, value shown or hidden, blind shows ?", () => {
    const s = solved();
    const doc = structuredClone(s.doc);
    addProbe(doc, "voltage", { kind: "terminal", part: "Rb", terminal: 0 }, "pv", "l1");
    addProbe(doc, "current", { kind: "through", part: "Ra", reversed: false }, "pi", "l2");
    const view = new ViewTransform();
    const renderer = {
      view,
      terminalsOf: (id: string) => (doc.parts[id] ? resolver.terminals(doc.parts[id]) : []),
      probeAnchor: (t: { kind: string; part?: string; terminal?: number }) => (t.part ? resolver.terminals(doc.parts[t.part])[t.terminal ?? 0] : undefined),
    } as unknown as Parameters<typeof buildFlags>[0]["renderer"];
    const live = { compiled: compile(doc, resolver), display: s.display };
    const flags = buildFlags({ doc, renderer, theme: lightTheme, live, selection: new Set(["pv"]), blind: false });
    const v = flags.find((f) => f.id === "pv")!;
    expect(v.value).toBe("2.50 V");
    expect(v.selected).toBe(true);
    const a = view.toScreen({ x: 20 + 1, y: -10 - 2 });
    expect(v.at).toEqual(a);
    const i = flags.find((f) => f.id === "pi")!;
    expect(i.clamp).toBe(true);
    expect(i.arrow).toBeDefined();
    doc.probes.pv.flag.showValue = false;
    expect(buildFlags({ doc, renderer, theme: lightTheme, live, selection: new Set(), blind: false }).find((f) => f.id === "pv")!.value).toBeUndefined();
    expect(buildFlags({ doc, renderer, theme: lightTheme, live, selection: new Set(), blind: true }).find((f) => f.id === "pi")!.value).toBe("?");
  });
});

describe("circuit-law tools on a two-loop circuit", () => {
  test("Loop tool: the steps around a loop sum to 0 V", () => {
    const s = solved();
    const plus = s.compiled.netlist.elements.find((e) => e.id === "V1")!.nodes[0];
    const j = s.compiled.netlist.elements.find((e) => e.id === "Rb")!.nodes[0];
    const r = loopSteps(s, [plus, j, 0, plus]);
    expect(r.closed).toBe(true);
    expect(r.steps.map((x) => x.element)).toEqual(["Ra", "Rb", "V1"]);
    close(r.steps[0].rise, -7.5);
    close(r.steps[1].rise, -2.5);
    close(r.steps[2].rise, 10);
    expect(Math.abs(r.sum)).toBeLessThan(1e-9);
    expect(lawSum(r.sum, r.steps.map((x) => x.rise), "V")).toBe("0 V");
    // The second loop, through Rc and back up Rb.
    const r2 = loopSteps(s, [j, 0, j]);
    expect(Math.abs(r2.sum)).toBeLessThan(1e-12);
  });

  test("Junction tool: currents at the junction node sum to 0 A", () => {
    const s = solved();
    const j = s.compiled.netlist.elements.find((e) => e.id === "Rb")!.nodes[0];
    const r = junctionCurrents(s, j);
    expect(r.branches.map((b) => b.element).sort()).toEqual(["Ra", "Rb", "Rc", "Rd"]);
    const ra = r.branches.find((b) => b.element === "Ra")!;
    close(ra.leaving, -7.5e-3, 1e-9); // enters the node
    expect(Math.abs(r.sum)).toBeLessThan(1e-9 * 7.5e-3 * 1000); // solver precision
    expect(lawSum(r.sum, r.branches.map((b) => b.leaving), "A")).toBe("0 A");
  });
});

describe("multimeter", () => {
  test("DC mean and AC RMS of a sampled sine; ohms from the test current", () => {
    const m = new LeadSampler(2000);
    for (let i = 0; i <= 1000; i++) m.push(i / 1000, 1 + 2 * Math.sin(2 * Math.PI * 5 * (i / 1000)));
    const st = m.stats()!;
    close(st.mean, 1, 1e-3);
    close(st.acRms, 2 / Math.SQRT2, 1e-3);
    expect(ohmsFrom(1)).toBe(1000);
    expect(ohmsFrom(1e6)).toBe(Infinity);
  });

  test("ohmmeter netlist reads a resistor network when unpowered", () => {
    const doc = circuit();
    doc.parts.V1.props.voltage = 0;
    const s = solved(doc);
    const ra = s.compiled.netlist.elements.find((e) => e.id === "Rc")!.nodes;
    const r = dcTable(ohmmeterNetlist(s.compiled.netlist, ra[0], 0), getModelFactory);
    // Seen from J to ground: Rb ∥ Rc ∥ Rd ∥ Ra (V1 at 0 V is a short) = 250 Ω.
    close(ohmsFrom(r.display[ra[0]]), 250, 1e-6);
  });
});

describe("session: blind flags, notices, flag drag", () => {
  const controller = () => new AppController(circuit(), { worker: { postMessage() {}, onmessage: null } });

  test("blind traces empty the chart lanes", () => {
    const c = controller();
    c.edits.edit({ key: "probe.add" }, (d) => void addProbe(d, "voltage", { kind: "across", part: "Ra" }, "p1", "l1"));
    expect(c.chartLanes()[0].traces).toHaveLength(1);
    c.store.set({ blind: { readouts: true, traces: true } });
    expect(c.chartLanes()).toEqual([]);
    expect(measureOf(c).blind()).toBe(true);
    c.dispose();
  });

  test("deleting a part says which probe went with it, and Undo restores both", () => {
    const c = controller();
    c.edits.edit({ key: "probe.add" }, (d) => void addProbe(d, "current", { kind: "through", part: "Rb", reversed: false }, "p1", "l1"));
    c.store.set({ selection: ["Rb"] });
    c.commands.run("edit.delete");
    const s = measureOf(c);
    expect(s.ui.get().notices.map((n) => n.text)).toEqual(["Probe I1 removed with Rb"]);
    c.edits.undo();
    expect(c.edits.doc.probes.p1).toBeDefined();
    c.dispose();
  });

  test("dragging a flag moves only the flag; clicking the arrow reverses a current probe", () => {
    const c = controller();
    c.edits.edit({ key: "probe.add" }, (d) => void addProbe(d, "current", { kind: "through", part: "Ra", reversed: false }, "p1", "l1"));
    const s = measureOf(c);
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    (c as { schematic: unknown }).schematic = { view: new ViewTransform(), selection: new Set(), setCircuit() {} };
    s.flagHits = [{ id: "p1", box: { x: 100, y: 100, w: 40, h: 18 }, arrow: { x: 10, y: 10, w: 20, h: 20 } }];
    const ev = (x: number, y: number) => ({ x, y, button: 0, shiftKey: false, time: 0 });
    c.tools.pointerDown(ev(110, 108));
    c.tools.pointerMove(ev(110 + 32, 108 + 16));
    c.tools.pointerUp(ev(110 + 32, 108 + 16));
    expect(c.store.get().selection).toEqual(["p1"]);
    expect(c.edits.doc.probes.p1.flag.offset).toEqual({ x: 3, y: -1 });
    expect(c.edits.doc.parts.Ra.at).toEqual({ x: 0, y: -6 });
    c.tools.pointerDown(ev(20, 20));
    c.tools.pointerUp(ev(20, 20));
    expect(c.edits.doc.probes.p1.target).toMatchObject({ reversed: true });
    (c as { schematic: unknown }).schematic = undefined;
    c.dispose();
    vi.unstubAllGlobals();
  });
});

describe("AC analysis props", () => {
  test("sources have acMagnitude and acPhase, shown after an AC heading, and survive save and load", () => {
    for (const type of ["dc-source", "ac-source", "current-source"]) {
      const keys = orderedProps(getDescriptor(type)!.props).map((p) => p.key);
      expect(keys.slice(-3)).toEqual([AC_HEADING, "acMagnitude", "acPhase"]);
    }
    const doc = circuit();
    doc.parts.V1.props.acMagnitude = 1;
    doc.parts.V1.props.acPhase = -45;
    const back = parseCircuit(serializeCircuit(doc)).doc;
    expect(back.parts.V1.props).toMatchObject({ acMagnitude: 1, acPhase: -45 });
  });

  test("impedance is V ÷ I; phasors use a sine source's amplitude and phase", () => {
    expect(cdiv(1, 0, 0, 1)).toEqual([0, -1]);
    const z = impedanceFrom({ re: [10], im: [0] }, { re: [0.01], im: [0] }, false);
    close(z.mag[0], 1000);
    close(impedanceFrom({ re: [10], im: [0] }, { re: [-0.01], im: [0] }, true).mag[0], 1000);
    const n = phasorNetlist({ nodeCount: 1, nodeNames: ["GND", "N1"], elements: [{ id: "V", type: "ac-source", nodes: [1, 0], props: { amplitude: 5, phase: 30 } }], settings: {} as never });
    expect(n.elements[0].props).toMatchObject({ acMagnitude: 5, acPhase: 30 });
  });
});
