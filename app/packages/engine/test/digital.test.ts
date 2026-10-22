// Digital kernel (simulation-engine.md §4) with fixture logic models.
import { createEngine, type Engine } from "@cs/engine";
import { lookup, netlist } from "./fixtures/digital";

type Trace = { t: number[]; v: number[] };

/** Run to `until`, collecting channel 0. */
function run(e: Engine, until: number, maxSteps = 1e6): Trace & { steps: number } {
  const t: number[] = [];
  const v: number[] = [];
  let steps = 0;
  while (e.time < until && steps < maxSteps) {
    const out = e.step();
    if (!out.ok) throw new Error(`step failed at ${e.time}: ${JSON.stringify(e.diagnostics)}`);
    steps++;
  }
  const b = e.drainSamples();
  for (let i = 0; i < b.times.length; i++) {
    t.push(b.times[i]);
    v.push(b.samples[i]);
  }
  return { t, v, steps };
}

/** Times at which the trace changes value (time of the first sample with the new value). */
function edges(tr: Trace): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  for (let i = 1; i < tr.v.length; i++) if (!Object.is(tr.v[i], tr.v[i - 1])) out.push({ t: tr.t[i], v: tr.v[i] });
  return out;
}

const EDGE = 1e-6;

/** A rises at 1 µs; Y = A AND NOT(A). Nodes: 1 A, 2 notA, 3 Y. */
const hazard = (delay: number) =>
  netlist(3, [
    ["S", "dsrc", [1], { value: "0", after: "1", edgeAt: EDGE }],
    ["N", "gate1", [1, 2], { fn: "not", delay }],
    ["G", "gate2", [1, 2, 3], { fn: "and", delay }],
  ]);

describe("digital kernel", () => {
  test("zero-delay delta cycles settle at one instant with no visible glitch", () => {
    const e = createEngine(hazard(0), lookup);
    e.setChannels([{ id: "y", kind: "logic", node: 3 }]);
    const tr = run(e, 3 * EDGE);
    expect(tr.v.every((v) => v === 0)).toBe(true);
    expect(e.logicStates()[2]).toBe(0); // notA low
  });

  test("propagation delays produce the glitch a real circuit makes (DIG-05)", () => {
    const e = createEngine(hazard(10e-9), lookup);
    e.setChannels([{ id: "y", kind: "logic", node: 3 }]);
    const tr = run(e, 3 * EDGE);
    const ed = edges(tr).filter((x) => x.t > 0.5 * EDGE);
    expect(ed.map((x) => x.v)).toEqual([1, 0]);
    expect(ed[0].t).toBeCloseTo(EDGE + 10e-9, 15);
    expect(ed[1].t).toBeCloseTo(EDGE + 20e-9, 15);
  });

  test("a pure digital circuit advances event to event", () => {
    const e = createEngine(hazard(10e-9), lookup);
    const times: number[] = [];
    while (e.time < 3 * EDGE) {
      e.step();
      times.push(e.time);
    }
    for (const t of [EDGE, EDGE + 10e-9, EDGE + 20e-9]) expect(times.some((x) => Math.abs(x - t) < 1e-18)).toBe(true);
  });

  test("X and Z propagate through gates (DIG-02)", () => {
    const e = createEngine(
      netlist(6, [
        ["SX", "dsrc", [1], { value: "X" }],
        ["S1", "dsrc", [2], { value: "1" }],
        ["S0", "dsrc", [3], { value: "0" }],
        ["G1", "gate2", [1, 2, 4], { fn: "and" }], // X & 1 = X
        ["G0", "gate2", [1, 3, 5], { fn: "and" }], // X & 0 = 0
        ["GZ", "gate1", [6, 6], { fn: "not" }], // undriven... drives its own input: oscillates X? no: X stays X
      ]),
      lookup,
    );
    e.setChannels([
      { id: "x", kind: "logic", node: 4 },
      { id: "zero", kind: "logic", node: 5 },
    ]);
    e.step();
    const b = e.drainSamples();
    const n = b.times.length;
    expect(b.samples[n - 1]).toBe(0.5);
    expect(b.samples[2 * n - 1]).toBe(0);
    expect(e.logicStates().slice(1, 6)).toEqual(Uint8Array.from([2, 1, 0, 2, 0]));
  });

  test("an undriven net is Z and reads as NaN on a logic channel", () => {
    const e = createEngine(netlist(1, [["P", "dprobe", [1], {}]]), lookup);
    e.setChannels([{ id: "z", kind: "logic", node: 1 }]);
    const b = e.drainSamples();
    expect(Number.isNaN(b.samples[b.samples.length - 1])).toBe(true);
    expect(e.logicStates()[1]).toBe(3);
  });

  test("a zero-delay inverter loop stops with a diagnostic; with delay it oscillates", () => {
    // NOT fed back through an AND enabled by S at 1 µs.
    const ring = (delay: number) =>
      createEngine(
        netlist(3, [
          ["S", "dsrc", [1], { value: "0", after: "1", edgeAt: EDGE }],
          ["G", "gate2", [1, 3, 2], { fn: "and" }],
          ["N", "gate1", [2, 3], { fn: "not", delay }],
        ]),
        lookup,
      );
    const bad = ring(0);
    let out = bad.step();
    while (out.ok && bad.time < 2 * EDGE) out = bad.step();
    expect(out.ok).toBe(false);
    expect(bad.status).toBe("stopped");
    expect(bad.diagnostics[0]?.id).toBe("digital-oscillation");

    // With 10 ns on the NOT it oscillates with a 20 ns period.
    const osc = ring(10e-9);
    osc.setChannels([{ id: "y", kind: "logic", node: 3 }]);
    const tr = run(osc, EDGE + 200e-9);
    const ed = edges(tr).filter((x) => x.t > EDGE);
    expect(ed.length).toBeGreaterThanOrEqual(18);
    for (let i = 1; i < ed.length; i++) expect(ed[i].t - ed[i - 1].t).toBeCloseTo(10e-9, 15);
  });

  test("a digital output drives an analog RC through its output resistance (D→A)", () => {
    const R = 990;
    const C = 1e-6;
    const tau = (R + 10) * C;
    const e = createEngine(
      netlist(3, [
        ["S", "dsrc", [1], { value: "0", after: "1", edgeAt: 1e-4 }],
        ["B", "gate1", [1, 2], { fn: "buf" }],
        ["R1", "resistor", [2, 3], { resistance: R }],
        ["C1", "capacitor", [3, 0], { capacitance: C }],
      ]),
      lookup,
    );
    e.setChannels([{ id: "vc", kind: "voltage", a: 3, b: 0 }]);
    const tr = run(e, 1e-4 + 5 * tau);
    let maxErr = 0;
    tr.t.forEach((t, i) => {
      const ref = t <= 1e-4 ? 0 : 5 * (1 - Math.exp(-(t - 1e-4) / tau));
      maxErr = Math.max(maxErr, Math.abs(tr.v[i] - ref));
    });
    expect(maxErr).toBeLessThan(0.02);
  });

  test("an analog ramp switches a digital input at its threshold (A→D)", () => {
    // 1 V/ms ramp: a 1 mA source into 1 µF crosses 2.5 V at 2.5 ms.
    const e = createEngine(
      netlist(2, [
        ["I1", "isource", [0, 1], { current: 1e-3 }],
        ["C1", "capacitor", [1, 0], { capacitance: 1e-6 }],
        ["N", "gate1", [1, 2], { fn: "not" }],
      ]),
      lookup,
    );
    e.setChannels([{ id: "y", kind: "logic", node: 2 }]);
    const tr = run(e, 4e-3);
    const ed = edges(tr);
    expect(ed.length).toBe(1);
    expect(ed[0].v).toBe(0);
    expect(Math.abs(ed[0].t - 2.5e-3)).toBeLessThan(2.5e-3 * 1e-4);
  });

  test("restartFrom replays digital activity deterministically", () => {
    const e = createEngine(hazard(10e-9), lookup, { checkpointInterval: 2 });
    e.setChannels([{ id: "y", kind: "logic", node: 3 }]);
    run(e, 2 * EDGE);
    const ref = e.displayState();
    const tEnd = e.time;
    expect(e.restartFrom(0.5 * EDGE)).toBe(true);
    run(e, tEnd);
    expect(e.time).toBe(tEnd);
    expect(Array.from(e.displayState())).toEqual(Array.from(ref));
  });
});
