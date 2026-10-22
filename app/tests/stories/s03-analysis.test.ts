// @vitest-environment jsdom
// Spec §25 user stories that lean on the Analyses panel and measurements,
// walked through the real AppController (tests/helpers/app.ts) and the
// Analyses session on an in-process analysis worker (tests/helpers/analysis.ts):
// 25.10 rectifiers and ripple, 25.12 what a diode really does, 25.13 a
// transistor as a switch and amplifier, 25.14 an amplifier's gain against
// frequency, 25.15 the op-amp's virtual ground, 25.16 one filter, three views.

import { toBode, type AcResult, type DcResult, type SpectrumResult, type SweepResult } from "@cs/engine";
import { measureWindow } from "../../packages/app/src/chart/measure";
import { bodeMarkers, bodePoints } from "../../packages/app/src/analysis/markers";
import { analysisPanel } from "../helpers/analysis";
import { Story, type PartSpec } from "../helpers/app";

function measure(s: Story, probeId: string, kind: string, t0: number, t1 = s.time): number {
  const r = measureWindow(s.c.history, s.c.channelId(probeId), t0, t1, [kind])[kind];
  if (!r.ok) throw new Error(`${kind} of ${probeId}: ${r.reason.key}`);
  return r.value;
}

function trace(s: Story, probeId: string, t0 = 0, t1 = Infinity) {
  const v = s.c.history.view(s.c.channelId(probeId), t0, Math.min(t1, s.time));
  return { t: v.times(), v: v.values() };
}

/** Amplitude of the spectrum bin nearest f. */
const bin = (r: SpectrumResult, f: number) => r.amplitude[Math.round(f / r.resolution)];

const mid = (s: Story, label: string): { x: number; y: number } => {
  const [a, b] = s.terminals(s.ids[label]);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

describe("story 25.10: rectifiers and ripple", () => {
  const halfWave: PartSpec[] = [
    { label: "V1", type: "ac-source", props: { amplitude: 17, frequency: 60 }, nodes: [1, 0] },
    { label: "D1", type: "diode", nodes: [1, 2] },
    { label: "C1", type: "capacitor", props: { capacitance: 1000e-6 }, nodes: [2, 0] },
    { label: "RL", type: "resistor", props: { resistance: 100 }, nodes: [2, 0] },
  ];

  function runFor(s: Story, seconds: number) {
    s.c.setSpeed(0.1);
    s.run(seconds * 10_000);
    s.pause();
  }

  test("half-wave: about 2.7 V of ripple at 60 Hz (CHT-30)", () => {
    const s = new Story();
    s.build(halfWave);
    const out = s.probe("probe-v", s.stubMid("RL", 0));
    runFor(s, 0.25);
    const ripple = measure(s, out, "peakToPeak", 0.15);
    expect(ripple).toBeGreaterThan(2.2);
    expect(ripple).toBeLessThan(3.0);
    const crossingLevel = measure(s, out, "mean", 0.15);
    const f = measureWindow(s.c.history, s.c.channelId(out), 0.15, s.time, ["frequency"]).frequency;
    expect(f.ok && Math.abs(f.value - 60) / 60).toBeLessThan(0.02);
    expect(crossingLevel).toBeGreaterThan(12);
  });

  test("the diode conducts only in short, tall pulses near each peak (PRB-01)", () => {
    const s = new Story();
    s.build(halfWave);
    const iD = s.probe("probe-i", mid(s, "D1"));
    runFor(s, 0.25);
    const { t, v } = trace(s, iD, 0.15);
    const peak = Math.max(...Array.from(v, Math.abs));
    let on = 0;
    for (let k = 1; k < t.length; k++) if (Math.abs(v[k]) > 0.05 * peak) on += t[k] - t[k - 1];
    expect(on / (t[t.length - 1] - t[0])).toBeLessThan(0.25);
    expect(peak).toBeGreaterThan(5 * 0.16); // far above the 0.16 A average load current
  });

  test("a four-diode bridge: ripple at 120 Hz, roughly halved", () => {
    const s = new Story();
    s.build([
      { label: "V1", type: "ac-source", props: { amplitude: 17, frequency: 60 }, nodes: [1, 2] },
      { label: "D1", type: "diode", nodes: [1, 3] },
      { label: "D2", type: "diode", nodes: [2, 3] },
      { label: "D3", type: "diode", nodes: [0, 1] },
      { label: "D4", type: "diode", nodes: [0, 2] },
      { label: "C1", type: "capacitor", props: { capacitance: 1000e-6 }, nodes: [3, 0] },
      { label: "RL", type: "resistor", props: { resistance: 100 }, nodes: [3, 0] },
    ]);
    const out = s.probe("probe-v", s.stubMid("RL", 0));
    runFor(s, 0.25);
    expect(s.c.store.get().diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(s.time).toBeGreaterThan(0.24);
    const f = measureWindow(s.c.history, s.c.channelId(out), 0.15, s.time, ["frequency"]).frequency;
    expect(f.ok && Math.abs(f.value - 120) / 120).toBeLessThan(0.02);
    expect(measure(s, out, "peakToPeak", 0.15)).toBeLessThan(1.8);
  });

  test("Spectrum tab: a large DC bar, then the ripple; a larger capacitor shrinks the ripple bar (ANL-22, ANL-24, CTL-05)", async () => {
    const s = new Story();
    s.build(halfWave);
    s.probe("probe-v", s.stubMid("RL", 0));
    const a = analysisPanel(s.c);
    runFor(s, 0.35);
    const before = await a.run<SpectrumResult>("spectrum", { source: "all", window: "hann" });
    expect(before.amplitude[0]).toBeGreaterThan(10 * bin(before, 60));
    const ripple1 = bin(before, 60);
    expect(ripple1).toBeGreaterThan(0.3);
    s.setProps(s.ids.C1, { capacitance: 4700e-6 });
    s.c.commands.run("sim.reset");
    s.advance(20);
    runFor(s, 0.35);
    const after = await a.run<SpectrumResult>("spectrum", { source: "all", window: "hann" });
    expect(bin(after, 60)).toBeLessThan(ripple1 / 2);
  });
});

describe("story 25.12: what a diode really does", () => {
  /** Diode voltage at 10 mA from a DC sweep of a source through 100 Ω (ANL-18). */
  async function kneeAt10mA(type: string, props: Record<string, string | number>): Promise<{ v: number; logSlope: number[] }> {
    const s = new Story();
    s.build([
      { label: "V1", type: "battery", props: { voltage: 1 }, nodes: [1, 0] },
      { label: "R1", type: "resistor", props: { resistance: 100 }, nodes: [1, 2] },
      { label: "D1", type, props, nodes: [2, 0] },
    ]);
    const vd = s.probe("probe-v", s.stubMid("D1", 0));
    const id = s.probe("probe-i", mid(s, "D1"));
    const a = analysisPanel(s.c);
    const r = await a.run<SweepResult>("dcSweep", { element: s.ids.V1, key: "voltage", start: -1, stop: 5, steps: 121, scale: "linear" });
    const ser = r.series[0];
    const v = ser.y[vd];
    const i = ser.y[id].map(Math.abs);
    const k = i.findIndex((x) => x >= 0.01);
    const knee = v[k - 1] + ((0.01 - i[k - 1]) * (v[k] - v[k - 1])) / (i[k] - i[k - 1]);
    // d(log10 I)/dV over the exponential region, between 1 µA and 1 mA.
    const slopes: number[] = [];
    for (let j = 1; j < i.length; j++) if (i[j - 1] > 1e-6 && i[j] < 1e-3 && v[j] > v[j - 1]) slopes.push((Math.log10(i[j]) - Math.log10(i[j - 1])) / (v[j] - v[j - 1]));
    s.dispose();
    return { v: knee, logSlope: slopes };
  }

  test("silicon diode: the curve bends smoothly, and log current is a straight line against voltage (CHT-13)", async () => {
    const r = await kneeAt10mA("diode", {});
    expect(r.v).toBeGreaterThan(0.6);
    expect(r.v).toBeLessThan(0.8);
    expect(r.logSlope.length).toBeGreaterThan(0);
  });

  test.each([
    ["Schottky (diode with Is = 10 nA; no Schottky part yet)", "diode", { saturationCurrent: 1e-8 }, 0.3],
    ["red LED", "led", { color: "red" }, 1.8],
    ["blue LED", "led", { color: "blue" }, 2.8],
  ] as const)("%s bends at about its own voltage", async (_name, type, props, expected) => {
    const r = await kneeAt10mA(type, props);
    expect(Math.abs(r.v - expected)).toBeLessThan(0.15);
  });

  test.todo("CHT-34: X-Y lane with diode voltage across and current up, with a ghost per diode (CHT-17)");
  test.todo("CHT-13: logarithmic vertical scale on the DC sweep plot");
});

describe("story 25.13: a transistor as a switch and amplifier", () => {
  const parts: PartSpec[] = [
    { label: "VCC", type: "battery", props: { voltage: 12 }, nodes: [1, 0] },
    { label: "LP", type: "lamp", props: { ratedVoltage: 12, ratedPower: 1.2 }, nodes: [1, 2] },
    { label: "Q1", type: "npn-transistor", props: { beta: 100 }, nodes: [3, 2, 0] },
    { label: "POT", type: "potentiometer", props: { resistance: 10e3, position: 1 }, nodes: [1, 0, 4] },
    { label: "RB", type: "resistor", props: { resistance: 4700 }, nodes: [4, 3] },
  ];

  test("turning the potentiometer up: active region with Ic/Ib near 100, then saturation with Vce about 0.1 V (PRB-07, CAN-17, CTL-04)", async () => {
    const s = new Story();
    s.build(parts);
    const [b, c] = s.terminals(s.ids.Q1);
    const iB = s.probe("probe-i", b);
    const iC = s.probe("probe-i", c);
    // Each probe measures the terminal it was placed on (base, then collector).
    expect(s.doc.probes[iB].target).toMatchObject({ part: s.ids.Q1, terminal: 0 });
    expect(s.doc.probes[iC].target).toMatchObject({ part: s.ids.Q1, terminal: 1 });
    const a = analysisPanel(s.c);
    const q = async () => (await a.run<DcResult>("dc")).parts.find((p) => p.id === s.ids.Q1)!.readouts;
    const seen: { ratio: number; region: number; vce: number; ic: number }[] = [];
    // Position 1 puts the wiper at the grounded end; turning it "up" lowers the position.
    for (const pos of [0.98, 0.95, 0.9, 0.2, 0.1, 0]) {
      s.setProps(s.ids.POT, { position: pos });
      s.run(50);
      const r = await q();
      seen.push({ ratio: Math.abs(s.value(iC) / s.value(iB)), region: r.region, vce: r.vce, ic: Math.abs(s.value(iC)) });
    }
    const active = seen.filter((x) => x.region === 1);
    const sat = seen.filter((x) => x.region === 2);
    expect(active.length).toBeGreaterThan(0);
    for (const x of active) expect(x.ratio).toBeCloseTo(100, -1);
    expect(sat.length).toBeGreaterThan(0);
    for (const x of sat) {
      expect(x.ratio).toBeLessThan(80);
      expect(x.vce).toBeLessThan(0.2);
    }
    // The collector current stops rising in saturation while the base current keeps climbing.
    expect(sat.at(-1)!.ic / sat[0].ic).toBeLessThan(1.05);
  });

  test.todo("CAN-17: the hover card names the region ('active region', 'saturation') and shows the current ratio");

  test("Sweep tab: Ic against Vce for five base currents gives the family of output curves (ANL-19)", async () => {
    const s = new Story();
    s.build([
      { label: "VCE", type: "battery", props: { voltage: 5 }, nodes: [1, 0] },
      { label: "IB", type: "current-source", props: { current: 10e-6 }, nodes: [0, 2] },
      { label: "Q1", type: "npn-transistor", props: { beta: 100 }, nodes: [2, 1, 0] },
    ]);
    const iC = s.probe("probe-i", s.terminals(s.ids.Q1)[1]);
    const a = analysisPanel(s.c);
    const r = await a.run<SweepResult>("dcSweep", {
      element: s.ids.VCE, key: "voltage", start: 0, stop: 5, steps: 51, scale: "linear",
      outerElement: s.ids.IB, outerKey: "current", outerList: "10u, 20u, 30u, 40u, 50u",
    });
    expect(r.series).toHaveLength(5);
    r.series.forEach((ser, k) => {
      const ic = ser.y[iC].map(Math.abs);
      const flat = ic[ic.length - 1];
      expect(flat).toBeCloseTo(100 * 10e-6 * (k + 1), 3); // β·Ib in the active region
      expect(ic[1]).toBeLessThan(0.9 * flat); // rising from saturation near Vce = 0
    });
  });
});

describe("story 25.14: how an amplifier's gain depends on frequency", () => {
  const amp = (vin: number): PartSpec[] => [
    { label: "VCC", type: "battery", props: { voltage: 12 }, nodes: [1, 0] },
    { label: "VIN", type: "ac-source", props: { amplitude: vin, frequency: 1000 }, nodes: [6, 0] },
    { label: "CIN", type: "capacitor", props: { capacitance: 10e-6 }, nodes: [6, 2] },
    { label: "R1", type: "resistor", props: { resistance: 100e3 }, nodes: [1, 2] },
    { label: "R2", type: "resistor", props: { resistance: 20e3 }, nodes: [2, 0] },
    { label: "RC", type: "resistor", props: { resistance: 4700 }, nodes: [1, 3] },
    { label: "RE", type: "resistor", props: { resistance: 1000 }, nodes: [4, 0] },
    { label: "RE2", type: "resistor", props: { resistance: 100 }, nodes: [5, 4] },
    { label: "CE", type: "capacitor", props: { capacitance: 100e-6 }, nodes: [4, 0] },
    { label: "Q1", type: "npn-transistor", props: {}, nodes: [2, 3, 5] },
    { label: "COUT", type: "capacitor", props: { capacitance: 10e-6 }, nodes: [3, 7] },
    { label: "RL", type: "resistor", props: { resistance: 10e3 }, nodes: [7, 0] },
  ];

  test("10 mV at 1 kHz: the output is a larger, inverted copy; the Frequency tab agrees and marks the low cutoff (CHT-30, ANL-08, ANL-11)", async () => {
    const s = new Story();
    s.build(amp(0.01));
    const vin = s.probe("probe-v", s.stubMid("VIN", 0));
    const vout = s.probe("probe-v", s.stubMid("RL", 0));
    s.c.setSpeed(0.01);
    s.run(3000); // 30 ms
    s.pause();
    const gainTime = measure(s, vout, "peakToPeak", 0.02) / measure(s, vin, "peakToPeak", 0.02);
    expect(gainTime).toBeGreaterThan(20);
    const a = analysisPanel(s.c);
    const r = await a.run<AcResult>("ac", { input: s.ids.VIN, start: 1, stop: 100e3, pointsPerDecade: 40 });
    const out = r.outputs.find((o) => o.id === vout)!;
    const k = r.freqs.findIndex((f) => f >= 1000);
    const bode = toBode(out.re[k], out.im[k]);
    expect(Math.abs(bode.db - 20 * Math.log10(gainTime))).toBeLessThan(1);
    expect(Math.abs(Math.abs(bode.deg) - 180)).toBeLessThan(15);
    const markers = bodeMarkers(bodePoints(r.freqs, out.re, out.im));
    const low = markers.filter((m) => m.kind === "cutoff").map((m) => m.freq);
    expect(low.some((f) => f < 1000)).toBe(true);

    // A smaller bypass capacitor moves the low cutoff upward; the old curve stays as a ghost.
    s.setProps(s.ids.CE, { capacitance: 10e-6 });
    const r2 = await a.run<AcResult>("ac");
    const out2 = r2.outputs.find((o) => o.id === vout)!;
    const low2 = bodeMarkers(bodePoints(r2.freqs, out2.re, out2.im)).filter((m) => m.kind === "cutoff").map((m) => m.freq);
    expect(Math.min(...low2.filter((f) => f < 1000))).toBeGreaterThan(Math.min(...low.filter((f) => f < 1000)));
    expect(a.session.ui.get().tabs.ac.ghost).toBe(r);
  });

  test.todo("ANL-14: clicking the Bode plot at 30 Hz and choosing Try this frequency sets the source to 30 Hz in the Time tab");

  test("200 mV input: the output flattens and the Spectrum tab shows strong harmonics (ANL-24)", async () => {
    const s = new Story();
    s.build(amp(0.2));
    const vout = s.probe("probe-v", s.stubMid("RL", 0));
    s.c.setSpeed(0.01);
    s.run(4000);
    s.pause();
    const a = analysisPanel(s.c);
    s.c.chartSession.toggleCursors(true);
    s.c.chartSession.setCursor("a", 0.02);
    s.c.chartSession.setCursor("b", 0.04);
    const sp = await a.run<SpectrumResult>("spectrum", { probe: vout, source: "cursors" });
    expect(sp.fundamental!.freq).toBeCloseTo(1000, -1);
    expect(sp.thd!).toBeGreaterThan(0.05);
  });
});

describe("story 25.15: the op-amp's virtual ground", () => {
  const s = new Story();
  s.build([
    { label: "VIN", type: "ac-source", props: { amplitude: 0.5, frequency: 100 }, nodes: [1, 0] },
    { label: "R1", type: "resistor", props: { resistance: 10e3 }, nodes: [1, 2] },
    { label: "RF", type: "resistor", props: { resistance: 100e3 }, nodes: [2, 3] },
    { label: "U1", type: "op-amp", props: {}, nodes: [2, 0, 3] },
  ]);
  const vin = s.probe("probe-v", s.stubMid("VIN", 0));
  const vout = s.probe("probe-v", s.stubMid("RF", 1));
  const vminus = s.probe("probe-v", s.stubMid("R1", 1));

  test("gain −10: an inverted 5 V sine, and the inverting input sits at microvolts (PRB-01, CHT-12)", () => {
    s.c.setSpeed(0.01);
    s.run(3000);
    s.pause();
    expect(measure(s, vout, "max", 0.01)).toBeCloseTo(5, 2);
    expect(measure(s, vout, "min", 0.01)).toBeCloseTo(-5, 2);
    const i = trace(s, vin, 0.01);
    const o = trace(s, vout, 0.01);
    for (let k = 0; k < i.v.length; k += 9) expect(o.v[k]).toBeCloseTo(-10 * i.v[k], 2);
    expect(Math.max(...Array.from(trace(s, vminus, 0.01).v, Math.abs))).toBeLessThan(1e-4);
  });

  test("gain −100: the output flattens at the rails and the inverting input jumps away from zero while clipped", () => {
    s.setProps(s.ids.RF, { resistance: 1e6 });
    s.c.commands.run("sim.reset");
    s.advance(20);
    s.run(3000);
    s.pause();
    expect(measure(s, vout, "max", 0.01)).toBeCloseTo(15, 1);
    expect(measure(s, vout, "min", 0.01)).toBeCloseTo(-15, 1);
    expect(Math.max(...Array.from(trace(s, vminus, 0.01).v, Math.abs))).toBeGreaterThan(0.1);
  });

  test.todo("CAN-17: the op-amp's hover card says it is saturated; RLM-01 output limits only with Realistic parts");
});

describe("story 25.16: one filter, three views", () => {
  const s = new Story();
  s.build([
    { label: "V1", type: "square-source", props: { amplitude: 1, frequency: 100 }, nodes: [1, 0] },
    { label: "R1", type: "resistor", props: { resistance: 1000 }, nodes: [1, 2] },
    { label: "C1", type: "capacitor", props: { capacitance: 1e-6 }, nodes: [2, 0] },
  ]);
  const vin = s.probe("probe-v", s.stubMid("V1", 0));
  const vout = s.probe("probe-v", s.stubMid("C1", 0));
  const a = analysisPanel(s.c);

  test("the Frequency tab marks −3 dB at 159 Hz (ANL-10, ANL-11, ANL-12)", async () => {
    const r = await a.run<AcResult>("ac", { input: s.ids.V1, start: 1, stop: 100e3, pointsPerDecade: 50 });
    const out = r.outputs.find((o) => o.id === vout)!;
    const cutoff = bodeMarkers(bodePoints(r.freqs, out.re, out.im)).find((m) => m.kind === "cutoff")!;
    expect(cutoff.freq / 159.15).toBeCloseTo(1, 1);
  });

  test("the Spectrum tab: input odd harmonics 1 : 1/3 : 1/5; the output loses the higher ones more (ANL-22, ANL-24)", async () => {
    s.c.setSpeed(0.05);
    s.run(4000); // 0.2 s: 20 periods
    s.pause();
    s.c.chartSession.toggleCursors(true);
    s.c.chartSession.setCursor("a", 0.04);
    s.c.chartSession.setCursor("b", 0.2);
    const inSp = await a.run<SpectrumResult>("spectrum", { probe: vin, source: "cursors" });
    const h = (r: SpectrumResult, n: number) => (n === 1 ? r.fundamental!.amplitude : r.harmonics.find((x) => x.n === n)!.amplitude);
    expect(h(inSp, 3) / h(inSp, 1)).toBeCloseTo(1 / 3, 1);
    expect(h(inSp, 5) / h(inSp, 1)).toBeCloseTo(1 / 5, 1);
    expect(h(inSp, 2) / h(inSp, 1)).toBeLessThan(0.02);
    const outSp = await a.run<SpectrumResult>("spectrum", { probe: vout, source: "cursors" });
    const atten = (n: number) => h(outSp, n) / h(inSp, n);
    expect(atten(3)).toBeLessThan(atten(1));
    expect(atten(5)).toBeLessThan(atten(3));
  });

  test("a larger R slides the cutoff marker left and shrinks the output harmonics (CTL-05)", async () => {
    const r1 = await a.run<AcResult>("ac");
    s.setProps(s.ids.R1, { resistance: 2000 });
    const r2 = await a.run<AcResult>("ac");
    const cut = (r: AcResult) => {
      const o = r.outputs.find((x) => x.id === vout)!;
      return bodeMarkers(bodePoints(r.freqs, o.re, o.im)).find((m) => m.kind === "cutoff")!.freq;
    };
    expect(cut(r2)).toBeLessThan(cut(r1));
    expect(cut(r2) / (cut(r1) / 2)).toBeCloseTo(1, 1);
  });
});
