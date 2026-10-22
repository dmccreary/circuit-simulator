// Analysis service core (history-and-analysis.md §5): DC tables, frequency
// response, sweeps and spectrum, run through the real element models.
import { createEngine, runAnalysisSync, sweepValues, toBode, spectrum, type AcResult, type DcResult, type SweepResult } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import type { Netlist, NetlistElement, PropValue } from "@cs/model";

type El = [string, string, number[], Record<string, PropValue>];

function netlist(nodeCount: number, els: El[], start: "zero" | "steady" = "zero"): Netlist {
  const elements: NetlistElement[] = els.map(([id, type, nodes, props]) => ({ id, type, nodes, props }));
  const nodeNames = ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)];
  return { nodeCount, nodeNames, elements, settings: { realisticParts: false, realisticRatings: false, start, seed: 1 } };
}

const ac = (n: Netlist, input: string, out: number, freqs: { start: number; stop: number; pointsPerDecade?: number }) =>
  runAnalysisSync({ kind: "ac", netlist: n, input, outputs: [{ id: "out", kind: "voltage", a: out, b: 0 }], freqs }, getModelFactory) as AcResult;

/** AC at an explicit list of frequencies (start = stop = f, one point each). */
function acAt(n: Netlist, input: string, out: number, f: number): { db: number; deg: number; mag: number } {
  const r = runAnalysisSync(
    { kind: "ac", netlist: n, input, outputs: [{ id: "out", kind: "voltage", a: out, b: 0 }], freqs: { start: f, stop: f * 1.000001, pointsPerDecade: 1 } },
    getModelFactory,
  ) as AcResult;
  expect(r.ok).toBe(true);
  const re = r.outputs[0].re[0];
  const im = r.outputs[0].im[0];
  return { ...toBode(re, im), mag: Math.hypot(re, im) };
}

/** Frequency where |H| first falls through `level` (linear), interpolated in log f. */
function crossing(r: AcResult, level: number): number {
  const mag = r.outputs[0].re.map((re, i) => Math.hypot(re, r.outputs[0].im[i]));
  for (let i = 1; i < mag.length; i++) {
    if (mag[i - 1] >= level && mag[i] < level) {
      const u = (mag[i - 1] - level) / (mag[i - 1] - mag[i]);
      return Math.exp(Math.log(r.freqs[i - 1]) + u * (Math.log(r.freqs[i]) - Math.log(r.freqs[i - 1])));
    }
  }
  return NaN;
}

const rcLowPass = () =>
  netlist(2, [
    ["V1", "ac-source", [1, 0], { amplitude: 1, frequency: 100 }],
    ["R1", "resistor", [1, 2], { resistance: 1000 }],
    ["C1", "capacitor", [2, 0], { capacitance: 1e-6 }],
  ]);

describe("frequency response", () => {
  test("RC low-pass: −3 dB at 1/(2πRC) within 1% and −45° there", () => {
    const fc = 1 / (2 * Math.PI * 1000 * 1e-6);
    const r = ac(rcLowPass(), "V1", 2, { start: 1, stop: 1e6, pointsPerDecade: 50 });
    expect(r.ok).toBe(true);
    expect(r.freqs.length).toBe(301);
    expect(r.nonlinear).toBe(false);
    expect(r.approximated).toEqual([]);
    const f3 = crossing(r, Math.SQRT1_2);
    expect(Math.abs(f3 - fc) / fc).toBeLessThan(0.01);
    const at = acAt(rcLowPass(), "V1", 2, fc);
    expect(at.db).toBeCloseTo(-3.0103, 3);
    expect(at.deg).toBeCloseTo(-45, 3);
  });

  test("series RLC: output across R peaks at 1/(2π√LC) with unity gain", () => {
    const [R, L, C] = [10, 10e-3, 1e-6];
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const n = netlist(3, [
      ["V1", "ac-source", [1, 0], { amplitude: 1, frequency: 1000 }],
      ["L1", "inductor", [1, 2], { inductance: L }],
      ["C1", "capacitor", [2, 3], { capacitance: C }],
      ["R1", "resistor", [3, 0], { resistance: R }],
    ]);
    const r = ac(n, "V1", 3, { start: 100, stop: 10000, pointsPerDecade: 500 });
    const mag = r.outputs[0].re.map((re, i) => Math.hypot(re, r.outputs[0].im[i]));
    const k = mag.indexOf(Math.max(...mag));
    expect(Math.abs(r.freqs[k] - f0) / f0).toBeLessThan(0.005);
    expect(mag[k]).toBeCloseTo(1, 3);
    // Current output: the inductor's branch current equals V(R)/R.
    const ri = runAnalysisSync(
      { kind: "ac", netlist: n, input: "V1", outputs: [{ id: "i", kind: "current", element: "R1", terminal: 0 }, { id: "iL", kind: "current", element: "L1", terminal: 0 }], freqs: { start: f0, stop: f0 * 1.000001, pointsPerDecade: 1 } },
      getModelFactory,
    ) as AcResult;
    expect(ri.outputs[0].re[0]).toBeCloseTo(1 / R, 6);
    expect(ri.outputs[1].re[0]).toBeCloseTo(1 / R, 6);
  });

  test("common-emitter amplifier: small-signal gain matches a small transient within 3%", () => {
    const els: El[] = [
      ["VCC", "battery", [1, 0], { voltage: 12 }],
      ["R1", "resistor", [1, 2], { resistance: 100e3 }],
      ["R2", "resistor", [2, 0], { resistance: 20e3 }],
      ["RC", "resistor", [1, 3], { resistance: 4700 }],
      ["RE", "resistor", [4, 0], { resistance: 1000 }],
      ["Q1", "npn-transistor", [2, 3, 4], { beta: 100 }],
      ["VIN", "ac-source", [5, 0], { amplitude: 0.002, frequency: 1000 }],
      ["CIN", "capacitor", [5, 2], { capacitance: 100e-6 }],
    ];
    const n = netlist(5, els, "steady");
    const small = acAt(n, "VIN", 3, 1000);
    expect(small.mag).toBeGreaterThan(3.5);
    expect(small.mag).toBeLessThan(4.7);
    const r = runAnalysisSync({ kind: "dc", netlist: n }, getModelFactory) as DcResult;
    expect(r.ok).toBe(true);

    const e = createEngine(n, getModelFactory);
    e.setChannels([{ id: "out", kind: "voltage", a: 3, b: 0 }]);
    while (e.time < 6e-3) expect(e.step().ok).toBe(true);
    const { times, samples } = e.drainSamples();
    let lo = Infinity;
    let hi = -Infinity;
    times.forEach((t, i) => {
      if (t >= 4e-3) {
        lo = Math.min(lo, samples[i]);
        hi = Math.max(hi, samples[i]);
      }
    });
    const transientGain = (hi - lo) / (2 * 0.002);
    expect(Math.abs(transientGain - small.mag) / small.mag).toBeLessThan(0.03);
    // Inverting: phase near ±180°.
    expect(Math.abs(Math.abs(small.deg) - 180)).toBeLessThan(5);
  });
});

describe("DC analyses", () => {
  test("operating point tables and power balance", () => {
    const r = runAnalysisSync(
      {
        kind: "dc",
        netlist: netlist(2, [
          ["V1", "battery", [1, 0], { voltage: 10 }],
          ["R1", "resistor", [1, 2], { resistance: 1000 }],
          ["R2", "resistor", [2, 0], { resistance: 1000 }],
          ["C1", "capacitor", [2, 0], { capacitance: 1e-6 }],
        ]),
      },
      getModelFactory,
    ) as DcResult;
    expect(r.ok).toBe(true);
    expect(r.nodes.map((n) => n.voltage)).toEqual([expect.closeTo(10, 6), expect.closeTo(5, 6)]);
    const r1 = r.parts.find((p) => p.id === "R1")!;
    expect(r1.voltage).toBeCloseTo(5, 6);
    expect(r1.current).toBeCloseTo(0.005, 6);
    expect(r1.power).toBeCloseTo(0.025, 6);
    expect(r.powerDelivered).toBeCloseTo(0.05, 6);
    expect(r.powerAbsorbed).toBeCloseTo(r.powerDelivered, 6);
  });

  test("DC sweep of a diode traces the Shockley I–V curve", () => {
    const values = sweepValues(0, 0.75, 16);
    const r = runAnalysisSync(
      {
        kind: "sweep",
        sweep: "dc",
        netlist: netlist(1, [
          ["V1", "battery", [1, 0], { voltage: 0 }],
          ["D1", "diode", [1, 0], { saturationCurrent: 1e-14 }],
        ]),
        param: { element: "V1", key: "voltage" },
        values,
        outputs: [{ id: "id", kind: "current", element: "D1", terminal: 0 }],
      },
      getModelFactory,
    ) as SweepResult;
    expect(r.failed).toEqual([]);
    const s = r.series[0];
    expect(s.x).toEqual(values);
    values.forEach((v, i) => {
      const ref = 1e-14 * (Math.exp(v / 0.025852) - 1) + 1e-12 * v;
      expect(Math.abs(s.y.id[i] - ref)).toBeLessThanOrEqual(1e-6 * Math.abs(ref) + 1e-15);
    });
    // Monotonic and exponential: each 60 mV is roughly ×10 at the top end.
    expect(s.y.id[15] / s.y.id[14]).toBeGreaterThan(5);
  });

  test("DC sweep with an outer parameter gives one curve per outer value", () => {
    const r = runAnalysisSync(
      {
        kind: "sweep",
        sweep: "dc",
        netlist: netlist(2, [
          ["V1", "battery", [1, 0], { voltage: 0 }],
          ["R1", "resistor", [1, 2], { resistance: 1000 }],
          ["R2", "resistor", [2, 0], { resistance: 1000 }],
        ]),
        param: { element: "V1", key: "voltage" },
        values: [0, 1, 2],
        outer: { param: { element: "R2", key: "resistance" }, values: [1000, 3000] },
        outputs: [{ id: "v", kind: "voltage", a: 2, b: 0 }],
      },
      getModelFactory,
    ) as SweepResult;
    expect(r.series.map((s) => s.value)).toEqual([1000, 3000]);
    expect(r.series[0].y.v[2]).toBeCloseTo(1, 6);
    expect(r.series[1].y.v[2]).toBeCloseTo(1.5, 6);
  });
});

describe("parameter sweep", () => {
  const rc = () =>
    netlist(2, [
      ["V1", "battery", [1, 0], { voltage: 5 }],
      ["R1", "resistor", [1, 2], { resistance: 1000 }],
      ["C1", "capacitor", [2, 0], { capacitance: 1e-6 }],
    ]);

  test("transient family keeps one trace per value", () => {
    const r = runAnalysisSync(
      { kind: "sweep", sweep: "transient", netlist: rc(), param: { element: "R1", key: "resistance" }, values: [500, 1000, 2000], outputs: [{ id: "vc", kind: "voltage", a: 2, b: 0 }], duration: 2e-3 },
      getModelFactory,
    ) as SweepResult;
    expect(r.series.map((s) => s.value)).toEqual([500, 1000, 2000]);
    for (const s of r.series) {
      expect(s.x[0]).toBe(0);
      expect(s.y.vc[0]).toBeCloseTo(0, 6);
      expect(s.x[s.x.length - 1]).toBeGreaterThanOrEqual(2e-3);
    }
    const finals = r.series.map((s) => s.y.vc[s.y.vc.length - 1]);
    expect(finals[0]).toBeGreaterThan(finals[1]);
    expect(finals[1]).toBeGreaterThan(finals[2]);
  });

  test("measurement versus parameter: final capacitor voltage matches 5(1 − e^(−t/RC)) within 1%", () => {
    const values = [500, 1000, 2000, 4000];
    const r = runAnalysisSync(
      { kind: "sweep", sweep: "measurement", measure: "final", netlist: rc(), param: { element: "R1", key: "resistance" }, values, outputs: [{ id: "vc", kind: "voltage", a: 2, b: 0 }], duration: 1e-3 },
      getModelFactory,
    ) as SweepResult;
    expect(r.series).toHaveLength(1);
    const s = r.series[0];
    values.forEach((R, i) => {
      const t = 1e-3;
      const ref = 5 * (1 - Math.exp(-t / (R * 1e-6)));
      expect(Math.abs(s.y.vc[i] - ref) / ref).toBeLessThan(0.01);
    });
  });
});

describe("spectrum", () => {
  const sampled = (f: (t: number) => number, T: number, n: number) => {
    const times = Array.from({ length: n + 1 }, (_, i) => (T * i) / n);
    return { times, values: times.map(f) };
  };

  test("sine: one line at its frequency with the right amplitude, THD ≈ 0", () => {
    const { times, values } = sampled((t) => 0.5 + 2 * Math.sin(2 * Math.PI * 50 * t), 0.2, 4096);
    for (const window of ["hann", "rect", "flattop"] as const) {
      const r = spectrum({ times, values, window });
      expect(r.resolution).toBeCloseTo(5, 9);
      expect(r.fundamental!.freq).toBeCloseTo(50, 1);
      expect(r.fundamental!.amplitude).toBeCloseTo(2, 2);
      expect(r.amplitude[0]).toBeCloseTo(0.5, 2);
      expect(r.thd!).toBeLessThan(0.01);
    }
  });

  test("square wave: harmonics at odd multiples (4/πn), even ones absent", () => {
    const f = 100;
    const { times, values } = sampled((t) => ((t * f) % 1 < 0.5 ? 1 : -1), 0.1, 8192);
    const r = spectrum({ times, values, window: "hann" });
    expect(r.fundamental!.freq).toBeCloseTo(f, 0);
    expect(r.fundamental!.amplitude).toBeCloseTo(4 / Math.PI, 1);
    for (const h of r.harmonics) {
      expect(h.freq).toBeCloseTo(h.n * f, 0);
      if (h.n % 2 === 1) expect(Math.abs(h.amplitude - 4 / (Math.PI * h.n))).toBeLessThan(0.03);
      else expect(h.amplitude).toBeLessThan(0.02);
    }
    // THD of an ideal square wave: √(π²/8 − 1) ≈ 48.3% over all harmonics; ≈ 42% up to the 10th.
    expect(r.thd!).toBeGreaterThan(0.38);
    expect(r.thd!).toBeLessThan(0.49);
  });
});
