// @vitest-environment jsdom
// Spec §25 user stories about transients and AC, walked through the real
// AppController with the in-process engine: 25.3 watching a capacitor
// charge, 25.4 where does the energy go, 25.7 inductive kickback, 25.8
// energy sloshing in an LC circuit, 25.9 slowing down AC, 25.26 rocking the
// moment.

import { runAnalysisSync, type SweepResult } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import { fitSpeed } from "@cs/worker";
import { measureWindow } from "../../packages/app/src/chart/measure";
import { Story, type PartSpec } from "../helpers/app";

/** A probe's samples from the history store over [t0, t1]. */
function trace(s: Story, probeId: string, t0 = 0, t1 = Infinity): { t: Float64Array; v: Float64Array } {
  const v = s.c.history.view(s.c.channelId(probeId), t0, Math.min(t1, s.time));
  return { t: v.times(), v: v.values() };
}

function measure(s: Story, probeId: string, kind: string, t0: number, t1: number): number {
  const r = measureWindow(s.c.history, s.c.channelId(probeId), t0, t1, [kind])[kind];
  if (!r.ok) throw new Error(`${kind} of ${probeId}: ${r.reason.key}`);
  return r.value;
}

/** Simulated-time integral of a probe's trace (the Area measurement, CHT-30). */
const area = (s: Story, probeId: string, t0: number, t1: number) => measure(s, probeId, "mean", t0, t1) * (Math.min(t1, s.time) - t0);

/** Toggle a switch by clicking it with the Select tool (its lever is a control: one click flips it). */
function toggle(s: Story, label: string): void {
  const id = s.ids[label];
  const before = s.doc.parts[id].props.closed;
  const [a, b] = s.terminals(id);
  s.tool({ id: "select" });
  s.click({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  if (s.doc.parts[id].props.closed === before) s.doubleClick({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  expect(s.doc.parts[id].props.closed).toBe(!before);
}

function rcStory(): Story {
  const s = new Story();
  s.build([
    { label: "B1", type: "battery", props: { voltage: 10 }, nodes: [1, 0] },
    { label: "S1", type: "switch", props: { closed: false }, nodes: [1, 2] },
    { label: "R1", type: "resistor", props: { resistance: 10e3 }, nodes: [2, 3] },
    { label: "C1", type: "capacitor", props: { capacitance: 100e-6 }, nodes: [3, 0] },
  ]);
  return s;
}

describe("story 25.3: watching a capacitor charge", () => {
  const s = rcStory();
  // Step 1: a voltage probe on the capacitor's top wire, a current probe on the capacitor.
  const vC = s.probe("probe-v", s.stubMid("C1", 0));
  const [c0, c1] = s.terminals(s.ids.C1);
  const iC = s.probe("probe-i", { x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 });

  test.todo("PRB-02: Alt+click with the Select tool places a voltage probe on a wire and a current probe on a part");

  test("Fit to circuit picks a 5 s window once the switch closes (SIM-10, chart side)", () => {
    toggle(s, "S1");
    s.c.setSpeed("fit");
    s.advance(50);
    expect(s.c.chartSession.fitToCircuit()).toBe(true);
    expect(s.c.chartSession.model.span).toBeCloseTo(5, 9);
  });

  test("Fit to circuit picks a speed at which one time constant takes about two seconds (SIM-10)", () => {
    s.run(400);
    const speed = s.c.bus.latest!.effectiveSpeed;
    s.pause();
    expect(1 / speed).toBeGreaterThan(1.5); // seconds of real time per τ = 1 s
    expect(1 / speed).toBeLessThan(2.5);
  });

  test("closing the switch: V(C1) rises toward 10 V; the current starts at 1 mA and decays", () => {
    s.c.commands.run("sim.reset");
    s.advance(50);
    if (!s.doc.parts[s.ids.S1].props.closed) toggle(s, "S1");
    expect(s.doc.parts[s.ids.S1].props.closed).toBe(true);
    s.c.setSpeed(1);
    s.run(3200);
    s.pause();
    const v = trace(s, vC);
    const i = trace(s, iC);
    expect(v.v.at(-1)!).toBeGreaterThan(9.5);
    for (let k = 1; k < v.v.length; k++) expect(v.v[k]).toBeGreaterThanOrEqual(v.v[k - 1] - 1e-9);
    const i0 = Math.max(...Array.from(i.v, Math.abs));
    expect(i0).toBeGreaterThan(0.97e-3);
    expect(i0).toBeLessThanOrEqual(1.0001e-3);
    expect(Math.abs(i.v.at(-1)!)).toBeLessThan(0.05e-3);
  });

  test("cursors at the switch closing and at the 63.2% point read Δt = 1.00 s (CHT-24, CHT-26)", () => {
    const v = trace(s, vC);
    const tStart = v.t[Array.from(v.v).findIndex((x) => x > 1e-6) - 1] ?? 0;
    const k = Array.from(v.v).findIndex((x) => x >= 10 * (1 - Math.exp(-1)));
    s.c.chartSession.toggleCursors(true);
    s.c.chartSession.setCursor("a", tStart);
    s.c.chartSession.setCursor("b", v.t[k]);
    const cur = s.c.chartSession.model.cursors!;
    expect(cur.b - cur.a).toBeGreaterThan(0.98);
    expect(cur.b - cur.a).toBeLessThan(1.02);
  });

  test.todo("CHT-24: cursors snap to event markers (the switch closing) and to a level such as 63.2%");
  test.todo("CHT-26/CHT-30: a Time constant measurement reads 1.00 s with fit quality 'excellent'");
  test.todo("ANI-18: + and − charge marks build up on the capacitor plates");
  test.todo("CHT-18: Ghost on change keeps a ghost each time the R slider moves");

  test("a slider on R and a measurement-versus-parameter sweep from 1 kΩ to 22 kΩ (CTL-05, ANL-18)", () => {
    s.c.store.set({ selection: [s.ids.R1] });
    expect(s.c.commands.run("edit.addSlider")).toBe(true);
    expect(Object.values(s.doc.sliders).some((x) => x.part === s.ids.R1 && x.prop === "resistance")).toBe(true);
    // Measure V(C1) after 1 s for each R: 10 (1 − e^(−1 s / RC)). The time constant
    // itself is not a sweep measure yet, so check the curve against R·C instead.
    const cc = s.c.compiled!;
    const values = [1e3, 5.5e3, 10e3, 15.5e3, 22e3];
    const r = runAnalysisSync(
      { kind: "sweep", sweep: "measurement", netlist: cc.netlist, param: { element: s.ids.R1, key: "resistance" }, values, outputs: [cc.channels[vC]], duration: 1, measure: "final" },
      getModelFactory,
    ) as SweepResult;
    const ys = r.series[0].y[cc.channels[vC].id];
    values.forEach((R, k) => expect(ys[k]).toBeCloseTo(10 * (1 - Math.exp(-1 / (R * 100e-6))), 1));
  });
});

describe("story 25.4: where does the energy go?", () => {
  const s = rcStory();
  const toggleOn = () => toggle(s, "S1");
  const pB = s.probe("probe-p", (() => { const [a, b] = s.terminals(s.ids.B1); return { x: (a.x + b.x) / 2, y: a.y }; })());
  const pR = s.probe("probe-p", (() => { const [a, b] = s.terminals(s.ids.R1); return { x: (a.x + b.x) / 2, y: a.y }; })());
  const pC = s.probe("probe-p", (() => { const [a, b] = s.terminals(s.ids.C1); return { x: (a.x + b.x) / 2, y: a.y }; })());
  toggleOn();
  s.c.setSpeed(2);
  s.run(6000); // 12 s of circuit time: 12 τ

  test("delivered 10.0 mJ, stored 5.00 mJ, dissipated 5.00 mJ; totals balance (Area of power traces, CHT-30)", () => {
    s.pause();
    const T = s.time;
    const delivered = -area(s, pB, 0, T);
    const dissipated = area(s, pR, 0, T);
    const stored = area(s, pC, 0, T);
    expect(delivered / 10e-3).toBeCloseTo(1, 2);
    expect(stored / 5e-3).toBeCloseTo(1, 2);
    expect(dissipated / 5e-3).toBeCloseTo(1, 2);
    expect(Math.abs(delivered - stored - dissipated) / delivered).toBeLessThan(0.005);
  });

  test("a resistor sweep from 100 Ω to 100 kΩ always splits the energy half and half (ANL-18)", () => {
    const cc = s.c.compiled!;
    for (const R of [100, 10e3, 100e3]) {
      const tau = R * 100e-6;
      const r = runAnalysisSync(
        { kind: "sweep", sweep: "transient", netlist: cc.netlist, param: { element: s.ids.R1, key: "resistance" }, values: [R], outputs: [cc.channels[pR], cc.channels[pC]], duration: 12 * tau },
        getModelFactory,
      ) as SweepResult;
      const ser = r.series[0];
      const integ = (ys: number[]) => ys.reduce((acc, y, k) => (k ? acc + ((y + ys[k - 1]) / 2) * (ser.x[k] - ser.x[k - 1]) : 0), 0);
      const eR = integ(ser.y[cc.channels[pR].id]);
      const eC = integ(ser.y[cc.channels[pC].id]);
      expect(eR / eC).toBeCloseTo(1, 1);
    }
  });

  test.todo("PRB-20: the Energy panel lists delivered, stored and dissipated energy and shows that the totals balance");
  test.todo("CHT-33: a math trace V1 × I1 for the capacitor's power");
});

describe("story 25.7: inductive kickback", () => {
  // 12 V supply, 100 mH coil with 100 Ω winding, NPN switch driven by a push button.
  const parts: PartSpec[] = [
    { label: "VCC", type: "battery", props: { voltage: 12 }, nodes: [1, 0] },
    { label: "L1", type: "inductor", props: { inductance: 0.1 }, nodes: [1, 3] },
    { label: "RW", type: "resistor", props: { resistance: 100 }, nodes: [3, 2] },
    { label: "Q1", type: "npn-transistor", props: {}, nodes: [4, 2, 0] },
    { label: "PB", type: "push-button", props: { pressed: false }, nodes: [1, 5] },
    { label: "RB", type: "resistor", props: { resistance: 1000 }, nodes: [5, 4] },
    { label: "RBE", type: "resistor", props: { resistance: 10e3 }, nodes: [4, 0] },
  ];

  function pressAndRelease(s: Story, vCol: string): { held: number; peak: number; tRelease: number } {
    s.c.setSpeed(0.01); // 10 ms of circuit time per second
    s.setProps(s.ids.PB, { pressed: true });
    s.run(1000); // 10 ms held: 10 τ
    const held = s.value(vCol);
    const tRelease = s.time;
    s.setProps(s.ids.PB, { pressed: false });
    s.run(500);
    s.pause();
    const after = trace(s, vCol, tRelease);
    return { held, peak: Math.max(...after.v), tRelease };
  }

  test("held: the collector sits near 0 V; released: a spike far above 12 V that stays visible zoomed out (CHT-10, PRF-05, CHT-19)", () => {
    const s = new Story();
    s.build(parts);
    const vC = s.probe("probe-v", s.stubMid("Q1", 1));
    s.c.chartSession.setMode("triggered");
    s.c.chartSession.setTrigger({ level: 20 }, vC);
    expect(s.c.chartSession.model.mode).toBe("triggered");
    const { held, peak } = pressAndRelease(s, vC);
    expect(held).toBeLessThan(0.3);
    expect(peak).toBeGreaterThan(24);
    // Zoomed out to the whole run in 50 buckets, the min/max decimation keeps the spike.
    const view = s.c.history.view(s.c.channelId(vC), 0, s.time);
    const mm = view.minMaxBuckets(0, s.time, 50);
    expect(Math.max(...Array.from(mm.max).filter(Number.isFinite))).toBeCloseTo(peak, 6);
  });

  test.todo("CHT-10: Single trigger on the collector rising past 20 V captures one sweep and stops (needs the chart renderer's trigger capture)");
  test.todo("RLM-02/RLM-05/RLM-06/RLM-07: with Realistic ratings on, the transistor fails with a message that its collector voltage rating was exceeded");

  test("with a flyback diode the collector rises to only about 12.7 V, and current circulates in the coil–diode loop and dies away (ANI-01)", () => {
    const s = new Story();
    s.build([...parts, { label: "D1", type: "diode", props: {}, nodes: [2, 1] }]);
    const vC = s.probe("probe-v", s.stubMid("Q1", 1));
    const iD = s.probe("probe-i", s.stubMid("D1", 0));
    const { peak, tRelease } = pressAndRelease(s, vC);
    expect(peak).toBeGreaterThan(12.4);
    expect(peak).toBeLessThan(13.0);
    const id = trace(s, iD, tRelease);
    const iPeak = Math.max(...Array.from(id.v, Math.abs));
    expect(iPeak).toBeGreaterThan(0.1); // the coil's ~0.12 A moves into the diode
    expect(Math.abs(id.v.at(-1)!)).toBeLessThan(0.01 * iPeak);
  });
});

describe("story 25.8: energy sloshing in an LC circuit", () => {
  const L = 10e-3;
  const C = 10e-6;
  function lc(extra: { label: string; type: string; props: Record<string, number>; nodes: number[] }[] = [], lNodes = [2, 0]) {
    const s = new Story();
    s.build([
      { label: "C1", type: "capacitor", props: { capacitance: C, initialVoltage: 5 }, nodes: [1, 0] },
      { label: "S1", type: "switch", props: { closed: false }, nodes: [1, 2] },
      { label: "L1", type: "inductor", props: { inductance: L }, nodes: lNodes },
      ...extra,
    ]);
    // The initial voltage is used at reset (SIM-13), so Reset after setting it.
    s.c.commands.run("sim.reset");
    s.advance(20);
    return s;
  }

  test("voltage and current a quarter-cycle apart at 503 Hz; total stored energy constant (PRB-01, CHT-30, PRB-20)", () => {
    const s = lc();
    const v = s.probe("probe-v", s.stubMid("C1", 0));
    const i = s.probe("probe-i", s.stubMid("L1", 0));
    toggle(s, "S1");
    s.c.setSpeed(0.01);
    s.run(1000); // 10 ms: ~5 cycles
    s.pause();
    expect(measure(s, v, "frequency", 0, s.time)).toBeCloseTo(503.3, -1);
    const tv = trace(s, v);
    const ti = trace(s, i);
    // Where |V| peaks, I is near zero (quarter-cycle apart).
    const k = Array.from(tv.v).reduce((b, x, j) => (j > tv.v.length / 2 && Math.abs(x) > Math.abs(tv.v[b]) ? j : b), Math.floor(tv.v.length / 2));
    const iPeak = Math.max(...Array.from(ti.v, Math.abs));
    expect(Math.abs(ti.v[k]) / iPeak).toBeLessThan(0.1);
    // ½CV² + ½LI² stays at ½·10 µF·(5 V)² = 125 µJ.
    for (let j = 0; j < tv.v.length; j += 7) {
      const e = 0.5 * C * tv.v[j] ** 2 + 0.5 * L * ti.v[j] ** 2;
      expect(e / 125e-6).toBeCloseTo(1, 1);
    }
  });

  test("power probes on C and L alternate in sign: energy leaves one and enters the other", () => {
    const s = lc();
    const pc = (() => { const [a, b] = s.terminals(s.ids.C1); return s.probe("probe-p", { x: (a.x + b.x) / 2, y: a.y }); })();
    const pl = (() => { const [a, b] = s.terminals(s.ids.L1); return s.probe("probe-p", { x: (a.x + b.x) / 2, y: a.y }); })();
    toggle(s, "S1");
    s.c.setSpeed(0.01);
    s.run(600);
    s.pause();
    const a = trace(s, pc);
    const b = trace(s, pl);
    let opposite = 0;
    let both = 0;
    for (let j = 0; j < a.v.length; j++) {
      if (Math.abs(a.v[j]) < 1e-3) continue;
      both++;
      if (Math.sign(a.v[j]) === -Math.sign(b.v[j])) opposite++;
    }
    expect(opposite / both).toBeGreaterThan(0.98);
  });

  test("Fit to circuit for the LC tank chooses a speed from its 1.99 ms period (SIM-10)", () => {
    const s = lc();
    toggle(s, "S1");
    s.c.setSpeed(0.001); // never run at the fit speed here: on the virtual clock it would not stop
    s.run(100);
    s.pause();
    const ts = s.c.chartSession.ui.get().timeScales!;
    expect(ts.dominant).toBeLessThan(0.01);
    expect(fitSpeed(ts)).toBeLessThan(0.01);
  });

  test.todo("CHT-34: X-Y view of capacitor voltage against inductor current draws a closed ellipse, an inward spiral with R");

  test("a series R swept 1 Ω → 200 Ω as a transient family: fastest return without overshoot near 2√(L/C) ≈ 63 Ω (ANL-18, SIM-22)", () => {
    const s = lc([{ label: "R1", type: "resistor", props: { resistance: 1 }, nodes: [3, 0] }], [2, 3]);
    const vC = s.probe("probe-v", s.stubMid("C1", 0));
    s.setProps(s.ids.S1, { closed: true });
    s.advance(50);
    const cc = s.c.compiled!;
    const values = [1, 20, 63.2, 120, 200];
    const r = runAnalysisSync(
      { kind: "sweep", sweep: "transient", netlist: cc.netlist, param: { element: s.ids.R1, key: "resistance" }, values, outputs: [cc.channels[vC]], duration: 0.01 },
      getModelFactory,
    ) as SweepResult;
    const id = cc.channels[vC].id;
    const undershoot = r.series.map((ser) => Math.min(...ser.y[id]));
    expect(undershoot[0]).toBeLessThan(-4); // R = 1 Ω rings
    expect(undershoot[2]).toBeGreaterThan(-0.025); // critical: no overshoot past 0 V (0.5%)
    expect(undershoot[4]).toBeGreaterThan(-1e-6);
    // Settling: the critically damped curve is back within 1% sooner than the sluggish 200 Ω one.
    const settle = (ser: (typeof r.series)[number]) => ser.x[ser.y[id].findIndex((y, k) => ser.y[id].slice(k).every((z) => Math.abs(z) < 0.05))];
    expect(settle(r.series[2])).toBeLessThan(settle(r.series[4]));
  });
});

describe("story 25.9: slowing down AC", () => {
  const s = new Story();
  s.build([
    { label: "V1", type: "ac-source", props: { amplitude: 120 * Math.SQRT2, frequency: 60 }, nodes: [1, 0] },
    { label: "T1", type: "transformer", props: { inductance: 1000, ratio: 0.1, coupling: 1 }, nodes: [1, 0, 2, 0] },
    { label: "LP", type: "lamp", props: { ratedVoltage: 12, ratedPower: 12 }, nodes: [2, 0] },
  ]);

  test.todo("ANI-08: at real time the dots shimmer and a notice says the current reverses 120 times a second");

  test("Slow down: one 60 Hz cycle takes about two seconds (SIM-09, SIM-10)", () => {
    s.c.setSpeed("fit");
    s.run(500);
    const speed = s.c.bus.latest!.effectiveSpeed;
    s.pause();
    const realSecondsPerCycle = 1 / 60 / speed;
    expect(realSecondsPerCycle).toBeGreaterThan(1.5);
    expect(realSecondsPerCycle).toBeLessThan(2.5);
  });

  test("RMS: primary 0.10 A and 120 V, secondary 1.00 A and 12 V; the same average power both sides (CHT-30)", () => {
    // Current probes on the windings: the primary's P+ terminal and the secondary's S+ terminal.
    const [pPlus, , sPlus] = s.terminals(s.ids.T1);
    const iP = s.probe("probe-i", pPlus);
    const iS = s.probe("probe-i", sPlus);
    const vP = s.probe("probe-v", s.stubMid("T1", 0));
    const vS = s.probe("probe-v", s.stubMid("LP", 0));
    s.c.commands.run("sim.reset");
    s.advance(20);
    s.c.setSpeed(0.05);
    s.run(2400); // 120 ms: 7 cycles
    s.pause();
    const t0 = 1 / 60;
    const t1 = t0 + 6 / 60;
    expect(measure(s, iP, "rms", t0, t1)).toBeCloseTo(0.1, 2);
    expect(measure(s, iS, "rms", t0, t1)).toBeCloseTo(1.0, 1);
    expect(measure(s, vP, "rms", t0, t1) / 120).toBeCloseTo(1, 2);
    expect(measure(s, vS, "rms", t0, t1) / 12).toBeCloseTo(1, 2);
  });

  test.todo("ANI-12: wire colors pulse green → gray → red as the voltage reverses (visual: Playwright screenshot)");
});

describe("story 25.26: rocking the moment", () => {
  const s = new Story();
  s.build([
    { label: "B1", type: "battery", props: { voltage: 10 }, nodes: [1, 0] },
    { label: "S1", type: "switch", props: { closed: false }, nodes: [1, 2] },
    { label: "R1", type: "resistor", props: { resistance: 20 }, nodes: [2, 3] },
    { label: "L1", type: "inductor", props: { inductance: 10e-3 }, nodes: [3, 4] },
    { label: "C1", type: "capacitor", props: { capacitance: 10e-6 }, nodes: [4, 0] },
  ]);
  const iL = s.probe("probe-i", s.stubMid("L1", 0));
  const vL = s.probe("probe-v", (() => { const [a, b] = s.terminals(s.ids.L1); return { x: (a.x + b.x) / 2, y: a.y }; })());
  toggle(s, "S1");
  s.c.setSpeed(0.002);
  s.run(2000); // 4 ms after closing
  s.pause();

  test("the inductor voltage passes through zero at the current peak and is largest where the current changes fastest (CAN-18)", () => {
    const i = trace(s, iL);
    const v = trace(s, vL);
    const ai = Array.from(i.v, Math.abs);
    const kPeak = ai.indexOf(Math.max(...ai));
    const vMax = Math.max(...Array.from(v.v, Math.abs));
    expect(Math.abs(v.v[kPeak]) / vMax).toBeLessThan(0.05);
    // V_L = L dI/dt at every step.
    for (let k = 2; k < i.t.length - 1; k += 5) {
      const didt = (i.v[k + 1] - i.v[k - 1]) / (i.t[k + 1] - i.t[k - 1]);
      expect(Math.abs(Math.abs(v.v[k]) - Math.abs(10e-3 * didt))).toBeLessThan(0.05 * vMax);
    }
  });

  test("dragging the playhead back shows that moment on the schematic (CHT-22, CHT-23)", async () => {
    const i = trace(s, iL);
    const kPeak = Array.from(i.v, Math.abs).indexOf(Math.max(...Array.from(i.v, Math.abs)));
    expect(s.c.chartSession.canScrub).toBe(true);
    s.c.chartSession.scrubTo(i.t[kPeak]);
    for (let n = 0; n < 5; n++) {
      s.advance(10);
      await Promise.resolve();
    }
    expect(s.c.chartSession.ui.get().scrubbing).toBe(true);
    const shown = s.c.schematic!.displayState!;
    const live = s.c.bus.latest!.display;
    expect(Array.from(shown)).not.toEqual(Array.from(live));
    s.c.chartSession.endScrub();
    expect(Array.from(s.c.schematic!.displayState!)).toEqual(Array.from(live));
  });

  // DEFECT (ANI-09): ChartSession.pump() only calls setDisplay() for the
  // scrubbed state; it never advances the dot phases by the simulated-time
  // change, so the dots stand still instead of moving with the pointer.
  test.fails("dots speed up, slow and reverse as the playhead is dragged (ANI-09)", async () => {
    const a = s.c.schematic!.animator;
    const key = `w:${s.stubs["L1.0"]}:0`;
    const p0 = a.phaseOf(key);
    s.c.chartSession.scrubTo(s.time * 0.25);
    for (let n = 0; n < 5; n++) {
      s.advance(10);
      await Promise.resolve();
    }
    expect(a.phaseOf(key)).not.toBe(p0);
  });

  test.todo("CAN-19: the inductor's pinned meter follows the playhead");
  test.todo("CHT-33: a math trace d/dt(I1) matches the inductor voltage divided by L");
});
