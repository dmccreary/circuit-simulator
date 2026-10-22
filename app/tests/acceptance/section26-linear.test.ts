// Spec §26 "Acceptance Test Circuits", tests 1–9: DC, first- and
// second-order transients, and frequency response. Each describe() is one
// row of the table: the circuit as written, the procedure, and the stated
// tolerance. Runs headless through the real engine and element models.

import { runAnalysisSync, toBode, type AcResult } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import { frequency, max } from "@cs/history";
import { bodeMarkers, bodePoints } from "../../packages/app/src/analysis/markers";
import { engine, expectWithin, fitTimeConstant, netlist, simulate, valueAt, windowOf } from "../helpers/circuit";

describe("§26 test 1: 10 V across 1 kΩ", () => {
  test("current is 10.0 mA ±0.1%", () => {
    const e = engine(1, [
      ["V1", "battery", [1, 0], { voltage: 10 }],
      ["R1", "resistor", [1, 0], { resistance: 1000 }],
    ]);
    expectWithin(Math.abs(e.readouts("R1").current), 10e-3, 0.001, "I(R1)");
    expectWithin(Math.abs(e.readouts("V1").current), 10e-3, 0.001, "I(V1)");
  });
});

describe("§26 test 2: 12 V, 1 kΩ in series with two 2 kΩ in parallel", () => {
  test("source current 6.00 mA and middle node 6.00 V, ±0.1%", () => {
    const e = engine(2, [
      ["V1", "battery", [1, 0], { voltage: 12 }],
      ["R1", "resistor", [1, 2], { resistance: 1000 }],
      ["R2", "resistor", [2, 0], { resistance: 2000 }],
      ["R3", "resistor", [2, 0], { resistance: 2000 }],
    ]);
    expectWithin(Math.abs(e.readouts("V1").current), 6e-3, 0.001, "source current");
    expectWithin(e.displayState()[2], 6, 0.001, "middle node");
  });
});

describe("§26 test 3: 12 V divider of two 10 kΩ, loaded with 10 kΩ", () => {
  const divider = (load: [string, string, number[], Record<string, number>][]) =>
    engine(2, [
      ["V1", "battery", [1, 0], { voltage: 12 }],
      ["R1", "resistor", [1, 2], { resistance: 10e3 }],
      ["R2", "resistor", [2, 0], { resistance: 10e3 }],
      ...load,
    ]);

  test("loaded output is 4.00 V ±0.1%", () => {
    const e = divider([["RL", "resistor", [2, 0], { resistance: 10e3 }]]);
    expectWithin(e.displayState()[2], 4, 0.001, "loaded output");
  });

  test("Thévenin equivalent is 6.00 V and 5.00 kΩ ±0.1% (open-circuit voltage, short-circuit current)", () => {
    // The Thévenin tool (PRB-19) is not in the app yet; this checks the
    // physics it must reproduce: Vth = Voc, Rth = Voc / Isc.
    const voc = divider([]).displayState()[2];
    const isc = Math.abs(divider([["A1", "ammeter", [2, 0], { burdenResistance: 0 }]]).readouts("A1").current);
    expectWithin(voc, 6, 0.001, "Vth");
    expectWithin(voc / isc, 5000, 0.001, "Rth");
    // The equivalent, loaded, gives the same 4.00 V as the full circuit (story 25.5).
    const eq = engine(2, [
      ["VT", "battery", [1, 0], { voltage: voc }],
      ["RT", "resistor", [1, 2], { resistance: voc / isc }],
      ["RL", "resistor", [2, 0], { resistance: 10e3 }],
    ]);
    expectWithin(eq.displayState()[2], 4, 0.001, "equivalent loaded");
  });
});

/** Series source → switch → series element → shunt element; the switch closes at t = 0. */
function stepCircuit(series: [string, Record<string, number>], shunt: [string, Record<string, number>], v = 10) {
  const e = engine(3, [
    ["V1", "battery", [1, 0], { voltage: v }],
    ["S1", "switch", [1, 2], { closed: false }],
    ["X1", series[0], [2, 3], series[1]],
    ["X2", shunt[0], [3, 0], shunt[1]],
  ]);
  e.setParams([{ element: "S1", param: "closed", value: true }]);
  return e;
}

describe("§26 test 4: 10 V, 10 kΩ, 100 µF, switch closes at t = 0", () => {
  const e = stepCircuit(["resistor", { resistance: 10e3 }], ["capacitor", { capacitance: 100e-6 }]);
  const tr = simulate(e, [{ id: "vc", kind: "voltage", a: 3, b: 0 }], 6);

  test("capacitor voltage 6.32 V at 1 s and 9.93 V at 5 s, ±0.5%", () => {
    expectWithin(valueAt(tr, "vc", 1), 10 * (1 - Math.exp(-1)), 0.005, "Vc(1 s)");
    expectWithin(valueAt(tr, "vc", 5), 10 * (1 - Math.exp(-5)), 0.005, "Vc(5 s)");
  });

  test("fitted time constant 1.00 s ±0.5%", () => {
    const { t, v } = windowOf(tr, "vc", 0, 6);
    const fit = fitTimeConstant(t, v, 0, 0, 10);
    expectWithin(fit.tau, 1, 0.005, "τ");
    expect(fit.r2).toBeGreaterThan(0.999);
  });
});

describe("§26 test 5: 10 V, 100 Ω, 100 mH, switch closes at t = 0", () => {
  const e = stepCircuit(["resistor", { resistance: 100 }], ["inductor", { inductance: 0.1 }]);
  const tr = simulate(e, [{ id: "i", kind: "current", element: "X2", terminal: 0 }], 0.015);

  test("current 63.2 mA at 1 ms and 100 mA final, ±0.5%", () => {
    expectWithin(Math.abs(valueAt(tr, "i", 1e-3)), 0.1 * (1 - Math.exp(-1)), 0.005, "I(1 ms)");
    expectWithin(Math.abs(valueAt(tr, "i", 0.015)), 0.1, 0.005, "I(final)");
  });
});

describe("§26 test 6: 10 µF charged to 5 V, then connected to 10 mH", () => {
  const L = 10e-3;
  const C = 10e-6;
  const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C)); // 503.3 Hz
  const e = engine(2, [
    ["C1", "capacitor", [1, 0], { capacitance: C, initialVoltage: 5 }],
    ["S1", "switch", [1, 2], { closed: false }],
    ["L1", "inductor", [2, 0], { inductance: L }],
  ]);
  e.setParams([{ element: "S1", param: "closed", value: true }]);
  const tr = simulate(e, [{ id: "vc", kind: "voltage", a: 1, b: 0 }], 101 / f0);

  test("frequency 503 Hz ±0.5%", () => {
    const { t, v } = windowOf(tr, "vc", 0, 10 / f0);
    const f = frequency(t, v);
    expect(f.ok).toBe(true);
    if (f.ok) expectWithin(f.value, 503, 0.005, "frequency");
  });

  test("amplitude after 100 cycles is at least 99% of the start (SIM-22)", () => {
    const { t, v } = windowOf(tr, "vc", 99.5 / f0, 101 / f0);
    const m = max(t, v);
    expect(m.ok && m.value).toBeGreaterThanOrEqual(0.99 * 5);
  });
});

describe("§26 test 7: series RLC, 10 mH, 10 µF, R = 63.2 Ω, step input", () => {
  test("critical damping: overshoot below 0.5%", () => {
    const e = engine(4, [
      ["V1", "battery", [1, 0], { voltage: 10 }],
      ["S1", "switch", [1, 2], { closed: false }],
      ["R1", "resistor", [2, 3], { resistance: 63.2 }],
      ["L1", "inductor", [3, 4], { inductance: 10e-3 }],
      ["C1", "capacitor", [4, 0], { capacitance: 10e-6 }],
    ]);
    e.setParams([{ element: "S1", param: "closed", value: true }]);
    const tr = simulate(e, [{ id: "vc", kind: "voltage", a: 4, b: 0 }], 0.02);
    const peak = Math.max(...tr.ch.vc);
    expect((peak - 10) / 10).toBeLessThan(0.005);
    expectWithin(valueAt(tr, "vc", 0.02), 10, 0.005, "final");
  });
});

/** Frequency response of a netlist on a fine linear grid around a band. */
function ac(nl: ReturnType<typeof netlist>, out: { a: number; b: number }, start: number, stop: number, points: number) {
  const r = runAnalysisSync(
    { kind: "ac", netlist: nl, input: "V1", outputs: [{ id: "out", kind: "voltage", ...out }], freqs: { start, stop, scale: "linear", points } },
    getModelFactory,
  ) as AcResult;
  expect(r.ok).toBe(true);
  return r.freqs.map((f, i) => ({ f, ...toBode(r.outputs[0].re[i], r.outputs[0].im[i]) }));
}

/** Frequency where a monotonic stretch of the curve crosses `db`, interpolated. */
function crossing(pts: { f: number; db: number }[], db: number, from: number, to: number): number {
  for (let i = from; i !== to; i += Math.sign(to - from)) {
    const a = pts[i];
    const b = pts[i + Math.sign(to - from)];
    if ((a.db - db) * (b.db - db) <= 0) return a.f + ((db - a.db) * (b.f - a.f)) / (b.db - a.db);
  }
  return NaN;
}

describe("§26 test 8: series RLC, 10 mH, 10 µF, 10 Ω, frequency response of the resistor voltage", () => {
  test("peak at 503 Hz and Q = 3.16, ±1%", () => {
    const nl = netlist(3, [
      ["V1", "ac-source", [1, 0], { amplitude: 1, frequency: 500 }],
      ["L1", "inductor", [1, 2], { inductance: 10e-3 }],
      ["C1", "capacitor", [2, 3], { capacitance: 10e-6 }],
      ["R1", "resistor", [3, 0], { resistance: 10 }],
    ]);
    const pts = ac(nl, { a: 3, b: 0 }, 100, 1500, 14001); // 0.1 Hz spacing
    const k = pts.reduce((best, p, i) => (p.db > pts[best].db ? i : best), 0);
    expectWithin(pts[k].f, 503, 0.01, "peak frequency");
    const f1 = crossing(pts, pts[k].db - 3.0103, k, 0);
    const f2 = crossing(pts, pts[k].db - 3.0103, k, pts.length - 1);
    expectWithin(pts[k].f / (f2 - f1), Math.sqrt(10e-3 / 10e-6) / 10, 0.01, "Q");
    expectWithin(pts[k].f / (f2 - f1), 3.16, 0.01, "Q (spec value)");
  });
});

describe("§26 test 9: 1 kΩ, 1 µF low-pass filter, frequency response", () => {
  const nl = netlist(2, [
    ["V1", "ac-source", [1, 0], { amplitude: 1, frequency: 100 }],
    ["R1", "resistor", [1, 2], { resistance: 1000 }],
    ["C1", "capacitor", [2, 0], { capacitance: 1e-6 }],
  ]);

  test("−3 dB at 159 Hz ±1% with phase −45° ±1°", () => {
    const pts = ac(nl, { a: 2, b: 0 }, 10, 1000, 9901);
    const f3 = crossing(pts, -3.0103, 0, pts.length - 1);
    expectWithin(f3, 159, 0.01, "−3 dB frequency");
    const k = pts.findIndex((p) => p.f >= f3);
    expect(Math.abs(pts[k].deg - -45)).toBeLessThan(1);
  });

  test("the Frequency tab's markers (ANL-11) report the same cutoff and phase", () => {
    const r = runAnalysisSync(
      { kind: "ac", netlist: nl, input: "V1", outputs: [{ id: "out", kind: "voltage", a: 2, b: 0 }], freqs: { start: 1, stop: 100e3, pointsPerDecade: 50 } },
      getModelFactory,
    ) as AcResult;
    const m = bodeMarkers(bodePoints(r.freqs, r.outputs[0].re, r.outputs[0].im));
    const cutoff = m.find((x) => x.kind === "cutoff");
    expect(cutoff).toBeDefined();
    expectWithin(cutoff!.freq, 159, 0.01, "marker cutoff");
    const phase = m.find((x) => x.kind === "phase" && x.value === -45);
    expectWithin(phase!.freq, 159, 0.01, "marker −45°");
  });
});

