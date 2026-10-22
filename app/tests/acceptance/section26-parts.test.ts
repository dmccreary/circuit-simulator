// Spec §26 "Acceptance Test Circuits", tests 10–19: sources and their
// measurements, spectrum, semiconductors, energy, op-amp, 555, transformer,
// circuit laws, digital timing, and the LED. One describe() per table row.

import { runAnalysisSync, spectrum, type SweepResult } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import { dutyCycle, frequency, peakToPeak, rms } from "@cs/history";
import type { CompiledCircuit } from "@cs/model";
import { junctionCurrents, loopSteps } from "../../packages/app/src/law-tools/compute";
import { engine, expectWithin, integral, netlist, simulate, valueAt, windowOf, type Trace } from "../helpers/circuit";

const value = (r: { ok: true; value: number } | { ok: false }): number => (r.ok ? r.value : NaN);

describe("§26 test 10: 10 V peak, 50 Hz sine", () => {
  const e = engine(1, [
    ["V1", "ac-source", [1, 0], { amplitude: 10, frequency: 50 }],
    ["R1", "resistor", [1, 0], { resistance: 1000 }],
  ]);
  const tr = simulate(e, [{ id: "v", kind: "voltage", a: 1, b: 0 }], 0.21);
  const { t, v } = windowOf(tr, "v", 0, 0.2); // ten whole periods

  test("RMS 7.07 V ±0.2%", () => expectWithin(value(rms(t, v)), 10 / Math.SQRT2, 0.002, "RMS"));
  test("frequency 50.0 Hz ±0.2%", () => expectWithin(value(frequency(t, v)), 50, 0.002, "frequency"));
  test("peak-to-peak 20.0 V ±0.2%", () => expectWithin(value(peakToPeak(t, v)), 20, 0.002, "peak-to-peak"));
});

describe("§26 test 11: 1 kHz square wave, spectrum", () => {
  test("third harmonic is −9.54 dB relative to the fundamental, ±0.2 dB", () => {
    const e = engine(1, [
      ["V1", "square-source", [1, 0], { amplitude: 5, frequency: 1000 }],
      ["R1", "resistor", [1, 0], { resistance: 1000 }],
    ]);
    const tr = simulate(e, [{ id: "v", kind: "voltage", a: 1, b: 0 }], 0.0325);
    const s = spectrum({ times: tr.times, values: tr.ch.v, t0: 0, t1: 0.032 });
    expect(s.fundamental).toBeDefined();
    expectWithin(s.fundamental!.freq, 1000, 0.01, "fundamental");
    const h3 = s.harmonics.find((h) => h.n === 3)!;
    const db = 20 * Math.log10(h3.amplitude / s.fundamental!.amplitude);
    expect(Math.abs(db - 20 * Math.log10(1 / 3))).toBeLessThanOrEqual(0.2);
  });
});

describe("§26 test 12: default silicon diode, DC sweep", () => {
  // A current source sweeps the diode from 1 µA to 10 mA (ANL-18 DC sweep).
  const nl = netlist(1, [
    ["I1", "current-source", [0, 1], { current: 1e-3 }],
    ["D1", "diode", [1, 0], {}],
  ]);
  const values = Array.from({ length: 41 }, (_, i) => 1e-6 * 10 ** (i / 10));
  const r = runAnalysisSync(
    { kind: "sweep", sweep: "dc", netlist: nl, param: { element: "I1", key: "current" }, values, outputs: [{ id: "vd", kind: "voltage", a: 1, b: 0 }] },
    getModelFactory,
  ) as SweepResult;
  const vd = r.series[0].y.vd;

  test("the sweep converges at every point", () => expect(r.failed).toEqual([]));

  test("voltage at 1 mA is 0.60–0.70 V", () => {
    const v1m = vd[values.findIndex((x) => Math.abs(x / 1e-3 - 1) < 1e-9)];
    expect(v1m).toBeGreaterThanOrEqual(0.6);
    expect(v1m).toBeLessThanOrEqual(0.7);
  });

  test("slope of log current against voltage is about 60 mV per decade, ±10%", () => {
    const decades = 3; // 1 µA to 1 mA: indices 0 and 30
    const slope = (vd[30] - vd[0]) / decades;
    expectWithin(slope, 0.06, 0.1, "mV per decade");
  });
});

describe("§26 test 13: 10 V charging 100 µF through 1 kΩ", () => {
  const e = engine(3, [
    ["V1", "battery", [1, 0], { voltage: 10 }],
    ["S1", "switch", [1, 2], { closed: false }],
    ["R1", "resistor", [2, 3], { resistance: 1000 }],
    ["C1", "capacitor", [3, 0], { capacitance: 100e-6 }],
  ]);
  e.setParams([{ element: "S1", param: "closed", value: true }]);
  const tr = simulate(
    e,
    [
      { id: "pV", kind: "power", element: "V1" },
      { id: "pR", kind: "power", element: "R1" },
      { id: "pC", kind: "power", element: "C1" },
    ],
    2, // 20 τ
  );
  const delivered = -integral(tr, "pV");
  const dissipated = integral(tr, "pR");
  const stored = integral(tr, "pC");

  test("energy delivered 10.0 mJ, stored 5.00 mJ, dissipated 5.00 mJ, ±0.5%", () => {
    expectWithin(delivered, 10e-3, 0.005, "delivered");
    expectWithin(stored, 5e-3, 0.005, "stored");
    expectWithin(dissipated, 5e-3, 0.005, "dissipated");
    expectWithin(e.readouts("C1").energy, 5e-3, 0.005, "C1 energy readout");
  });

  test("the totals balance within ±0.1%", () => {
    expect(Math.abs(delivered - stored - dissipated) / delivered).toBeLessThanOrEqual(0.001);
  });
});

describe("§26 test 14: ideal op-amp inverting amplifier, 10 kΩ and 100 kΩ, 0.5 V input", () => {
  test("output −5.00 V ±0.1%; inverting input below 1 mV", () => {
    const e = engine(3, [
      ["V1", "battery", [1, 0], { voltage: 0.5 }],
      ["R1", "resistor", [1, 2], { resistance: 10e3 }],
      ["RF", "resistor", [2, 3], { resistance: 100e3 }],
      ["U1", "op-amp", [2, 0, 3], {}],
    ]);
    const v = e.displayState();
    expectWithin(v[3], -5, 0.001, "output");
    expect(Math.abs(v[2])).toBeLessThan(1e-3);
  });
});

describe("§26 test 15: 555 astable, R1 = 1 kΩ, R2 = 10 kΩ, C = 10 µF", () => {
  const [r1, r2, c, vcc] = [1000, 10e3, 10e-6, 10];
  // Nodes: 1 Vcc, 2 discharge, 3 trigger/threshold, 4 output, 5 control.
  const e = engine(5, [
    ["V1", "battery", [1, 0], { voltage: vcc }],
    ["R1", "resistor", [1, 2], { resistance: r1 }],
    ["R2", "resistor", [2, 3], { resistance: r2 }],
    ["C1", "capacitor", [3, 0], { capacitance: c }],
    ["U1", "timer-555", [2, 3, 3, 1, 5, 4, 1, 0], {}],
    ["RL", "resistor", [4, 0], { resistance: 10e3 }],
  ]);
  const tr = simulate(e, [{ id: "out", kind: "voltage", a: 4, b: 0 }], 1.6);
  // Skip the first cycle, which starts with the capacitor empty.
  const { t, v } = windowOf(tr, "out", 0.3, 1.6);

  test("frequency 6.87 Hz (1.44 ÷ ((R1 + 2·R2)·C)) ±2%", () => {
    expectWithin(value(frequency(t, v, { level: vcc / 2 })), 1.44 / ((r1 + 2 * r2) * c), 0.02, "frequency");
  });

  test("duty cycle 52.4% ±2%", () => {
    expectWithin(value(dutyCycle(t, v, { level: vcc / 2 })), 0.524, 0.02, "duty cycle");
  });
});

describe("§26 test 16: ideal transformer, 10:1, 120 V RMS primary, 12 Ω load", () => {
  // "Ideal": unity coupling and a magnetizing inductance large enough that
  // its current (120 V / (2π·60·1000 H) = 0.3 mA) is negligible.
  const e = engine(2, [
    ["V1", "ac-source", [1, 0], { amplitude: 120 * Math.SQRT2, frequency: 60 }],
    ["T1", "transformer", [1, 0, 2, 0], { inductance: 1000, ratio: 0.1, coupling: 1 }],
    ["RL", "resistor", [2, 0], { resistance: 12 }],
  ]);
  const tr = simulate(
    e,
    [
      { id: "vs", kind: "voltage", a: 2, b: 0 },
      { id: "ip", kind: "current", element: "T1", terminal: 0 },
    ],
    0.11,
  );
  const span = (id: string) => windowOf(tr, id, 1 / 60, 6 / 60); // five whole periods

  test("secondary voltage 12.0 V RMS ±0.5%", () => {
    const { t, v } = span("vs");
    expectWithin(value(rms(t, v)), 12, 0.005, "Vs RMS");
  });

  test("primary current 0.100 A RMS ±0.5%", () => {
    const { t, v } = span("ip");
    expectWithin(value(rms(t, v)), 0.1, 0.005, "Ip RMS");
  });
});

describe("§26 test 17: two-loop circuit from story 25.6", () => {
  // 9 V and 3 V batteries sharing a middle resistor:
  //   V1(+1,−0)  R1 1→2  R2 2→0 (middle)  R3 2→3  V2(+3,−0)
  const els = (v2: number) =>
    engine(3, [
      ["V1", "battery", [1, 0], { voltage: 9 }],
      ["R1", "resistor", [1, 2], { resistance: 1000 }],
      ["R2", "resistor", [2, 0], { resistance: 2000 }],
      ["R3", "resistor", [2, 3], { resistance: 1500 }],
      ["V2", "battery", [3, 0], { voltage: v2 }],
    ]);
  // Display precision: 0.00 V and 0.00 A (rounded to the shown digit).
  const shows0 = (x: number, step: number) => expect(Math.abs(x)).toBeLessThan(step / 2);

  // First from the parts' own readouts (the physics), then through the
  // Loop and Junction tools' computation (PRB-16, PRB-18) on the same solution.
  test.each([0, 3, 7.5, 12])("loop and junction sums read 0.00 V and 0.00 A with V2 = %s V", (v2) => {
    const e = els(v2);
    const d = (id: string) => e.readouts(id).voltage; // terminal 0 minus terminal 1
    // Left loop 0→1→2→0, right loop 0→2→3→0, outer loop 0→1→2→3→0, as rises minus drops.
    shows0(d("V1") - d("R1") - d("R2"), 0.01);
    shows0(d("R2") - d("R3") - d("V2"), 0.01);
    shows0(d("V1") - d("R1") - d("R3") - d("V2"), 0.01);
    // Junction at node 2: current into node 2 from R1 equals the currents leaving through R2 and R3.
    const i = (id: string) => e.readouts(id).current; // into terminal 0
    shows0(i("R1") - i("R2") - i("R3"), 1e-5);
    expect(Math.abs(d("R1"))).toBeGreaterThan(0.1); // the loops are not trivially dead
  });

  test.each([0, 3, 7.5, 12])("the Loop and Junction tools read 0.00 V and 0.00 A with V2 = %s V (PRB-16, PRB-18)", (v2) => {
    const e = els(v2);
    const compiled = { netlist: e.netlist, nodes: [], pointToNode: new Map(), segments: [], channels: {}, identity: {}, diagnostics: [] } as CompiledCircuit;
    const src = { compiled, display: e.displayState() };
    for (const loop of [[0, 1, 2, 0], [0, 2, 3, 0], [0, 1, 2, 3, 0]]) {
      const r = loopSteps(src, loop);
      expect(r.closed).toBe(true);
      shows0(r.sum, 0.01);
    }
    const j = junctionCurrents(src, 2);
    expect(j.branches.map((b) => b.element).sort()).toEqual(["R1", "R2", "R3"]);
    shows0(j.sum, 1e-5);
  });

  test("the middle resistor's current reverses partway through the 0–12 V drag, while the junction stays balanced", () => {
    const signs = [0, 12].map((v2) => Math.sign(els(v2).readouts("R3").current));
    expect(signs[0]).not.toBe(signs[1]);
  });
});

describe("§26 test 18: 4-bit ripple counter, 1 kHz clock, 10 ns delays", () => {
  // Toggle flip-flops: D = Q̄, each stage clocked by the previous stage's Q̄.
  // Nodes: 1 clock; stage k: Q = 2 + 2k, Q̄ = 3 + 2k; 10.. unconnected S/R.
  const ff = (k: number): [string, string, number[], Record<string, number>] => {
    const clk = k === 0 ? 1 : 3 + 2 * (k - 1);
    const q = 2 + 2 * k;
    const qb = 3 + 2 * k;
    return [`U${k}`, "d-flip-flop", [qb, clk, q, qb, 10 + 2 * k, 11 + 2 * k], { delay: 10e-9 }];
  };
  const e = engine(17, [["CLK", "clock", [1], { frequency: 1000 }], ff(0), ff(1), ff(2), ff(3)]);
  const tr: Trace = simulate(
    e,
    [0, 1, 2, 3].map((k) => ({ id: `q${k}`, kind: "logic" as const, node: 2 + 2 * k })),
    18e-3,
  );
  const count = (t: number) => [0, 1, 2, 3].reduce((s, k) => s + (valueAt(tr, `q${k}`, t) > 0.5 ? 1 << k : 0), 0);
  // valueAt interpolates; logic samples are step functions, so read the last sample at or before t.
  const countAt = (t: number) => {
    let i = 0;
    while (i + 1 < tr.times.length && tr.times[i + 1] <= t) i++;
    return [0, 1, 2, 3].reduce((s, k) => s + (tr.ch[`q${k}`][i] === 1 ? 1 << k : 0), 0);
  };

  test("counts 0 to 15 and wraps, exactly", () => {
    const seq = Array.from({ length: 18 }, (_, k) => countAt(k * 1e-3 + 0.75e-3));
    expect(seq).toEqual(Array.from({ length: 18 }, (_, k) => k % 16));
    expect(count(0.75e-3)).toBe(0);
  });

  test("the change from 7 to 8 passes through 7, 6, 4, 0, 8 at 10 ns steps", () => {
    // The 7 → 8 change starts at the clock edge that ends count 7.
    const edge = 8e-3;
    expect([5, 15, 25, 35, 45].map((ns) => countAt(edge + ns * 1e-9))).toEqual([7, 6, 4, 0, 8]);
  });
});

describe("§26 test 19: red LED on 9 V through 360 Ω", () => {
  test("LED current about 20 mA, ±10%", () => {
    const e = engine(2, [
      ["V1", "battery", [1, 0], { voltage: 9 }],
      ["R1", "resistor", [1, 2], { resistance: 360 }],
      ["D1", "led", [2, 0], { color: "red" }],
    ]);
    expectWithin(Math.abs(e.readouts("D1").current), 20e-3, 0.1, "LED current");
  });
});
