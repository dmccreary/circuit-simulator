// @vitest-environment jsdom
// Spec §25 user stories with timers and logic, walked through the real
// AppController (tests/helpers/app.ts): 25.17 inside the 555 timer,
// 25.18 counting in binary, glitches included, 25.19 from numbers to voltages.

import type { SpectrumResult } from "@cs/engine";
import { measureWindow } from "../../packages/app/src/chart/measure";
import { addProbe } from "../../packages/app/src/probes/add";
import { junctionCurrents } from "../../packages/app/src/law-tools/compute";
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

/** A logic probe on a part's terminal stub, put on a logic lane (DIG-07). */
function logicProbe(s: Story, label: string, terminal: number): string {
  const id = `lp_${label}_${terminal}`;
  s.c.edits.edit({ key: "probe.add" }, (d) => void addProbe(d, "logic", { kind: "point", wire: s.stubs[`${label}.${terminal}`], segment: 0, t: 0.5 }, id, "lane_logic"));
  return id;
}

describe("story 25.17: inside the 555 timer", () => {
  // 10 V supply, R1 = 5 kΩ, R2 = 10 kΩ, C = 10 µF: duty (R1 + R2) / (R1 + 2·R2) = 60%.
  // 555 pins: dis, tr, th, Vcc, ctl, out, rst, gnd.
  const astable = (r2: number): PartSpec[] => [
    { label: "VCC", type: "battery", props: { voltage: 10 }, nodes: [1, 0] },
    { label: "R1", type: "resistor", props: { resistance: 5e3 }, nodes: [1, 2] },
    { label: "R2", type: "resistor", props: { resistance: r2 }, nodes: [2, 3] },
    { label: "C1", type: "capacitor", props: { capacitance: 10e-6 }, nodes: [3, 0] },
    { label: "U1", type: "timer-555", nodes: [2, 3, 3, 1, 5, 4, 1, 0] },
    { label: "RL", type: "resistor", props: { resistance: 10e3 }, nodes: [4, 0] },
  ];
  const s = new Story();
  s.build(astable(10e3));
  const vC = s.probe("probe-v", s.stubMid("C1", 0));
  const out = s.probe("probe-v", s.stubMid("RL", 0));
  s.c.setSpeed(1);
  s.run(1500);
  s.pause();

  test("the capacitor turns at 3.33 V and 6.67 V, a third and two thirds of the supply (CHT-26, CHT-29)", () => {
    expect(measure(s, vC, "min", 0.4) / (10 / 3)).toBeCloseTo(1, 1);
    expect(measure(s, vC, "max", 0.4) / (20 / 3)).toBeCloseTo(1, 1);
  });

  test("the Duty cycle measurement reads 60% (CHT-30)", () => {
    const duty = measureWindow(s.c.history, s.c.channelId(out), 0.4, s.time, ["dutyCycle"]).dutyCycle;
    expect(duty.ok).toBe(true);
    if (duty.ok) expect(Math.abs(duty.value - 0.6)).toBeLessThan(0.02);
  });

  test("changing R2 with a slider: frequency and duty track the datasheet formulas (CTL-05)", () => {
    s.c.store.set({ selection: [s.ids.R2] });
    expect(s.c.commands.run("edit.addSlider")).toBe(true);
    const f1 = measure(s, out, "frequency", 0.4);
    s.setProps(s.ids.R2, { resistance: 20e3 });
    const t0 = s.time;
    s.run(2500);
    s.pause();
    const f2 = measure(s, out, "frequency", t0 + 0.4);
    const formula = (r2: number) => 1.44 / ((5e3 + 2 * r2) * 10e-6);
    expect((f2 / f1) / (formula(20e3) / formula(10e3))).toBeCloseTo(1, 1);
    const duty = measureWindow(s.c.history, s.c.channelId(out), t0 + 0.4, s.time, ["dutyCycle"]).dutyCycle;
    if (duty.ok) expect(Math.abs(duty.value - 25e3 / 45e3)).toBeLessThan(0.02);
  });

  test.todo("EDT-36: double-clicking the 555 opens its inside (comparators, flip-flop, discharge transistor) and probes placed inside fire at the thresholds");
  test.todo("CHT-29: level cursors snap to the capacitor trace's turning points");
});

/** Toggle-mode D flip-flops: D = Q̄, clocked by the previous stage's Q̄; nodes from `base`. */
function rippleStages(base: number, delay: number): PartSpec[] {
  const out: PartSpec[] = [{ label: "CLK", type: "clock", props: { frequency: 1000 }, nodes: [1] }];
  for (let k = 0; k < 4; k++) {
    const q = base + 2 * k;
    const qb = q + 1;
    const clk = k === 0 ? 1 : base + 2 * (k - 1) + 1;
    out.push({ label: `U${k}`, type: "d-flip-flop", props: { delay }, nodes: [qb, clk, q, qb, -1, -1] });
  }
  return out;
}

/** The 4-bit count from four logic traces at time t (last sample at or before t). */
function countAt(s: Story, probes: string[], t: number): number {
  return probes.reduce((acc, id, k) => {
    const { t: ts, v } = trace(s, id);
    let j = 0;
    while (j + 1 < ts.length && ts[j + 1] <= t) j++;
    return acc + (v[j] >= 0.5 ? 1 << k : 0);
  }, 0);
}

describe("story 25.18: counting in binary, glitches included", () => {
  const s = new Story();
  s.build([
    ...rippleStages(10, 10e-9),
    ...[0, 1, 2, 3].map((k) => ({ label: `OUT${k}`, type: "logic-output", nodes: [10 + 2 * k] })),
  ]);
  const probes = [0, 1, 2, 3].map((k) => logicProbe(s, `U${k}`, 2));
  s.c.setSpeed(0.01);
  s.run(1800); // 18 ms
  s.pause();

  test("logic probes appear as compact logic lanes (DIG-07)", () => {
    const lanes = new Set(probes.map((p) => s.doc.probes[p].lane));
    expect(lanes.size).toBe(1);
    expect(s.doc.lanes.find((l) => l.id === [...lanes][0])?.kind).toBe("logic");
  });

  test("the count runs 0, 1, 2, … F and wraps (DIG-08)", () => {
    const seq = Array.from({ length: 17 }, (_, k) => countAt(s, probes, k * 1e-3 + 0.75e-3));
    expect(seq).toEqual(Array.from({ length: 17 }, (_, k) => k % 16));
  });

  test("zoomed into 7 → 8: the bus passes through 7, 6, 4, 0, 8 at 10 ns steps (DIG-05, DIG-09, CHT-20)", () => {
    expect([5, 15, 25, 35, 45].map((ns) => countAt(s, probes, 8e-3 + ns * 1e-9))).toEqual([7, 6, 4, 0, 8]);
    // Edge cursors on the Q0 and Q3 edges measure 10 ns between each step: 30 ns end to end.
    const edge = (id: string) => {
      const { t, v } = trace(s, id, 8e-3 - 1e-6, 8e-3 + 1e-6);
      return t[Array.from(v).findIndex((x, j) => j > 0 && x !== v[j - 1])];
    };
    expect((edge(probes[1]) - edge(probes[0])) * 1e9).toBeCloseTo(10, 6);
    expect((edge(probes[3]) - edge(probes[0])) * 1e9).toBeCloseTo(30, 6);
  });

  test.todo("DIG-08: grouping the four logic lanes into one bus lane shown in hexadecimal");

  test("a synchronous counter changes from 7 to 8 in one step", () => {
    const t = new Story();
    // JK flip-flops: J, CLK, K, Q, Q̄. Q0 toggles every edge; stage k toggles when all lower bits are 1.
    t.build([
      { label: "CLK", type: "clock", props: { frequency: 1000 }, nodes: [1] },
      { label: "HI", type: "logic-input", props: { high: true }, nodes: [2] },
      { label: "U0", type: "jk-flip-flop", props: { delay: 10e-9 }, nodes: [2, 1, 2, 10, -1] },
      { label: "U1", type: "jk-flip-flop", props: { delay: 10e-9 }, nodes: [10, 1, 10, 11, -1] },
      { label: "A1", type: "and-gate", props: { delay: 0 }, nodes: [10, 11, 20] },
      { label: "U2", type: "jk-flip-flop", props: { delay: 10e-9 }, nodes: [20, 1, 20, 12, -1] },
      { label: "A2", type: "and-gate", props: { delay: 0 }, nodes: [20, 12, 21] },
      { label: "U3", type: "jk-flip-flop", props: { delay: 10e-9 }, nodes: [21, 1, 21, 13, -1] },
    ]);
    const qs = [0, 1, 2, 3].map((k) => logicProbe(t, `U${k}`, 3));
    t.c.setSpeed(0.01);
    t.run(950);
    t.pause();
    expect(countAt(t, qs, 7.5e-3)).toBe(7);
    expect([5, 15, 25].map((ns) => countAt(t, qs, 8e-3 + ns * 1e-9))).toEqual([7, 8, 8]);
  });
});

describe("story 25.19: from numbers to voltages", () => {
  // R-2R ladder: bit k drives 2R into ladder node L_k; L_k—R—L_(k+1); L_0 has 2R to ground; output L_3.
  const R = 10e3;
  const ladder = (bits: number[]): PartSpec[] => [
    ...bits.map((n, k) => ({ label: `RB${k}`, type: "resistor", props: { resistance: 2 * R }, nodes: [n, 30 + k] })),
    { label: "RT", type: "resistor", props: { resistance: 2 * R }, nodes: [30, 0] },
    ...[0, 1, 2].map((k) => ({ label: `RL${k}`, type: "resistor", props: { resistance: R }, nodes: [30 + k, 31 + k] })),
  ];

  test("a 4-bit counter into the ladder draws a staircase of 5 V ÷ 16 = 0.3125 V steps (DIG-04, CHT-26)", () => {
    const s = new Story();
    s.build([...rippleStages(10, 0), ...ladder([10, 12, 14, 16])]);
    const vout = s.probe("probe-v", s.stubMid("RL2", 1));
    s.c.setSpeed(0.01);
    s.run(1800);
    s.pause();
    const at = (t: number) => {
      const { t: ts, v } = trace(s, vout);
      let j = 0;
      while (j + 1 < ts.length && ts[j + 1] <= t) j++;
      return v[j];
    };
    for (let k = 1; k < 15; k++) {
      const step = at((k + 1) * 1e-3 + 0.5e-3) - at(k * 1e-3 + 0.5e-3);
      expect(step / 0.3125).toBeCloseTo(1, 1);
    }
  });

  test("the Junction tool on the ladder's nodes shows the current halving at each rung (PRB-18)", () => {
    const s = new Story();
    s.build([
      { label: "B3", type: "logic-input", props: { high: true }, nodes: [5] },
      ...ladder([0, 0, 0, 5]),
    ]);
    s.run(50);
    const src = { compiled: s.c.compiled!, display: s.display };
    // With only the MSB high, the current down each rung's 2R halves from L_3 toward L_0.
    const rung = (k: number) => {
      const node = s.node(`RB${k}`, 1);
      const j = junctionCurrents(src, node);
      expect(Math.abs(j.sum)).toBeLessThan(1e-9);
      return Math.abs(j.branches.find((b) => b.element === s.ids[`RB${k}`])!.leaving);
    };
    expect(rung(1) / rung(2)).toBeCloseTo(0.5, 3);
    expect(rung(0) / rung(1)).toBeCloseTo(0.5, 3);
  });

  test("an RC low-pass after the ladder smooths the staircase; the Spectrum shows the step frequency reduced (ANL-22)", async () => {
    const s = new Story();
    s.build([
      ...rippleStages(10, 0),
      ...ladder([10, 12, 14, 16]),
      { label: "RF", type: "resistor", props: { resistance: 10e3 }, nodes: [33, 40] },
      { label: "CF", type: "capacitor", props: { capacitance: 1e-6 }, nodes: [40, 0] },
    ]);
    const raw = s.probe("probe-v", s.stubMid("RL2", 1));
    const smooth = s.probe("probe-v", s.stubMid("CF", 0));
    s.c.setSpeed(0.02);
    s.run(1700); // 34 ms: two full counts
    s.pause();
    const a = analysisPanel(s.c);
    s.c.chartSession.toggleCursors(true);
    s.c.chartSession.setCursor("a", 1e-3);
    s.c.chartSession.setCursor("b", 33e-3);
    // The steps put energy around the 1 kHz step frequency (images of the 62.5 Hz ramp at 937.5 and 1062.5 Hz).
    const bin = (r: SpectrumResult) => r.freqs.reduce((acc, f, k) => (f > 800 && f < 1200 ? acc + r.amplitude[k] : acc), 0);
    const spRaw = await a.run<SpectrumResult>("spectrum", { probe: raw, source: "cursors" });
    const spSmooth = await a.run<SpectrumResult>("spectrum", { probe: smooth, source: "cursors" });
    expect(bin(spSmooth)).toBeLessThan(0.5 * bin(spRaw));
  });
});
