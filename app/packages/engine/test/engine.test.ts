import { createEngine, eigenvalues, type Engine } from "@cs/engine";
import { lookup, netlist } from "./fixtures/models";

function runUntil(e: Engine, t: number, maxSteps = 1e6): void {
  for (let i = 0; i < maxSteps && e.time < t; i++) {
    const out = e.step();
    if (!out.ok) throw new Error(`step failed at ${e.time}: ${JSON.stringify(e.diagnostics)}`);
  }
}

const rc = () =>
  netlist(2, [
    ["V1", "vsource", [1, 0], { voltage: 5 }],
    ["R1", "resistor", [1, 2], { resistance: 1000 }],
    ["C1", "capacitor", [2, 0], { capacitance: 1e-6 }],
  ]);

describe("engine", () => {
  test("eigenvalues of a rotation-like matrix", () => {
    const ev = eigenvalues(Float64Array.from([0, -2, 3, 0]), 2)!;
    expect(Math.abs(ev.im[0])).toBeCloseTo(Math.sqrt(6), 12);
    expect(ev.re[0]).toBeCloseTo(0, 12);
  });

  test("voltage divider is solved at t = 0 on load", () => {
    const e = createEngine(
      netlist(2, [
        ["V1", "vsource", [1, 0], { voltage: 10 }],
        ["R1", "resistor", [1, 2], { resistance: 1000 }],
        ["R2", "resistor", [2, 0], { resistance: 1000 }],
      ]),
      lookup,
    );
    expect(e.time).toBe(0);
    expect(e.status).toBe("ok");
    const d = e.displayState();
    expect(d[2]).toBeCloseTo(5, 12);
    // terminal currents: V1 (2), R1 (2), R2 (2) after 3 node slots
    expect(d[3 + 2]).toBeCloseTo(0.005, 12); // into R1 terminal 0
    expect(d[3]).toBeCloseTo(-0.005, 12); // into V1 plus: source delivers current
    expect(e.timeScales.kind).toBe("static");
  });

  test("RC charging matches 1 - exp(-t/RC) within 0.5%", () => {
    const e = createEngine(rc(), lookup);
    e.setChannels([{ id: "vc", kind: "voltage", a: 2, b: 0 }]);
    expect(e.timeScales.kind).toBe("transient");
    expect(e.timeScales.fastest).toBeCloseTo(1e-3, 9);
    runUntil(e, 5e-3);
    const { times, samples } = e.drainSamples();
    expect(times.length).toBeGreaterThan(50);
    let maxErr = 0;
    for (let i = 0; i < times.length; i++) {
      const ref = 5 * (1 - Math.exp(-times[i] / 1e-3));
      maxErr = Math.max(maxErr, Math.abs(samples[i] - ref));
    }
    expect(maxErr).toBeLessThan(0.005 * 5);
  });

  test("ideal LC keeps at least 99% amplitude after 100 cycles (SIM-22)", () => {
    // Acceptance test 6: 10 uF charged to 5 V, 10 mH -> 503 Hz.
    const e = createEngine(
      netlist(1, [
        ["C1", "capacitor", [1, 0], { capacitance: 10e-6, ic: 5 }],
        ["L1", "inductor", [1, 0], { inductance: 10e-3 }],
      ]),
      lookup,
    );
    e.setChannels([{ id: "v", kind: "voltage", a: 1, b: 0 }]);
    const period = 2 * Math.PI * Math.sqrt(10e-6 * 10e-3);
    expect(e.timeScales.fastest).toBeCloseTo(period, 8);
    expect(e.displayState()[1]).toBeCloseTo(5, 6);
    runUntil(e, 101 * period);
    const { times, samples } = e.drainSamples();
    let peak = 0;
    let crossings = 0;
    for (let i = 1; i < times.length; i++) {
      if (times[i] > 100 * period) peak = Math.max(peak, Math.abs(samples[i]));
      if (samples[i - 1] < 0 && samples[i] >= 0) crossings++;
    }
    expect(peak).toBeGreaterThan(0.99 * 5);
    expect(peak).toBeLessThan(1.01 * 5);
    expect(crossings).toBeGreaterThanOrEqual(100);
    expect(crossings).toBeLessThanOrEqual(102);
  });

  const rectifier = () =>
    netlist(2, [
      ["V1", "vsource", [1, 0], { amplitude: 10, frequency: 60 }],
      ["D1", "diode", [1, 2], {}],
      ["R1", "resistor", [2, 0], { resistance: 1000 }],
    ]);

  test("half-wave diode rectifier converges", () => {
    const e = createEngine(rectifier(), lookup);
    e.setChannels([{ id: "out", kind: "voltage", a: 2, b: 0 }]);
    expect(e.timeScales.kind).toBe("periodic");
    runUntil(e, 3 / 60);
    expect(e.status).toBe("ok");
    const { samples } = e.drainSamples();
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    expect(max).toBeGreaterThan(9.1);
    expect(max).toBeLessThan(9.6);
    expect(min).toBeGreaterThan(-1e-3);
  });

  test("determinism: two runs are bit-identical", () => {
    const run = () => {
      const e = createEngine(rectifier(), lookup);
      e.setChannels([{ id: "out", kind: "voltage", a: 2, b: 0 }]);
      runUntil(e, 2 / 60);
      return { d: e.displayState(), s: e.drainSamples() };
    };
    const a = run();
    const b = run();
    expect(Array.from(new Uint8Array(a.d.buffer))).toEqual(Array.from(new Uint8Array(b.d.buffer)));
    expect(Array.from(new Uint8Array(a.s.times.buffer))).toEqual(Array.from(new Uint8Array(b.s.times.buffer)));
    expect(Array.from(new Uint8Array(a.s.samples.buffer))).toEqual(Array.from(new Uint8Array(b.s.samples.buffer)));
  });

  test("topology swap keeps capacitor voltage at the same t (SIM-19)", () => {
    const e = createEngine(rc(), lookup);
    runUntil(e, 0.5e-3);
    const t = e.time;
    const vc = e.displayState()[2];
    // Add a second resistor across the capacitor; R1/C1 keep their ids.
    const next = rc();
    next.elements.push({ id: "R2", type: "resistor", nodes: [2, 0], props: { resistance: 1000 } });
    e.replaceNetlist(next, { V1: "V1", R1: "R1", C1: "C1" });
    expect(e.time).toBe(t);
    expect(e.displayState()[2]).toBeCloseTo(vc, 6);
    expect(e.drainEvents().some((ev) => ev.kind === "topologyChanged")).toBe(true);
    runUntil(e, 10e-3);
    expect(e.displayState()[2]).toBeCloseTo(2.5, 3);
  });

  test("setParams re-solves at the same time", () => {
    const e = createEngine(rc(), lookup);
    runUntil(e, 1e-3);
    e.setParams([{ element: "V1", param: "voltage", value: 0 }]);
    expect(e.displayState()[1]).toBeCloseTo(0, 12);
    expect(e.timeScalesVersion).toBeGreaterThan(1);
  });

  test("steady start begins at the DC operating point", () => {
    const n = rc();
    n.settings.start = "steady";
    const e = createEngine(n, lookup);
    expect(e.displayState()[2]).toBeCloseTo(5, 6);
  });

  test("dangling node and singular matrix", () => {
    const ok = createEngine(
      netlist(2, [
        ["V1", "vsource", [1, 0], { voltage: 1 }],
        ["R1", "resistor", [1, 0], { resistance: 10 }],
      ]),
      lookup,
    );
    expect(ok.status).toBe("ok");
    const bad = createEngine(
      netlist(2, [
        ["V1", "vsource", [1, 0], { voltage: 1 }],
        ["V2", "vsource", [1, 0], { voltage: 2 }],
      ]),
      lookup,
    );
    expect(bad.status).toBe("stopped");
    expect(bad.diagnostics[0].id).toBe("singular-matrix");
    expect(bad.diagnostics[0].elements.length).toBeGreaterThan(0);
    expect(bad.step().ok).toBe(false);
    // SIM-15: fixing the values makes it solvable... parallel sources stay singular,
    // so remove one by topology swap.
    bad.replaceNetlist(netlist(1, [["V1", "vsource", [1, 0], { voltage: 1 }], ["R1", "resistor", [1, 0], {}]]), {});
    expect(bad.status).toBe("ok");
    expect(bad.diagnostics.length).toBe(0);
  });

  test("breakpoints land exactly on source edges", () => {
    const e = createEngine(
      netlist(2, [
        ["V1", "pulse", [1, 0], { voltage: 1, period: 1e-3 }],
        ["R1", "resistor", [1, 2], { resistance: 1000 }],
        ["C1", "capacitor", [2, 0], { capacitance: 1e-7 }],
      ]),
      lookup,
    );
    const edges: number[] = [];
    while (e.time < 2.1e-3) {
      const o = e.step();
      if (o.breakpoint) edges.push(o.t);
    }
    expect(edges.slice(0, 4).map((t) => Math.round(t * 1e7) / 1e7)).toEqual([0.5e-3, 1e-3, 1.5e-3, 2e-3]);
  });

  test("pause condition stops close to the crossing", () => {
    const e = createEngine(rc(), lookup);
    e.setChannels([{ id: "vc", kind: "voltage", a: 2, b: 0 }]);
    e.setPauseConditions([{ id: "p", channel: "vc", op: "rises-above", level: 2.5 }]);
    let hit: number | null = null;
    for (let i = 0; i < 10000 && hit === null; i++) {
      const o = e.step();
      if (o.pause) hit = o.t;
    }
    expect(hit).not.toBeNull();
    expect(hit!).toBeCloseTo(1e-3 * Math.log(2), 6);
  });

  test("history ring and restartFrom", () => {
    const e = createEngine(rc(), lookup, { checkpointInterval: 16 });
    runUntil(e, 3e-3);
    const s = e.stateAt(1e-3);
    expect(s).not.toBeNull();
    expect(s![2]).toBeCloseTo(5 * (1 - Math.exp(-1)), 1);
    expect(e.stateAt(10)).toBeNull();
    expect(e.restartFrom(1.2e-3)).toBe(true);
    expect(e.time).toBeLessThanOrEqual(1.2e-3);
    expect(e.time).toBeGreaterThan(1e-3);
    expect(e.displayState()[2]).toBeCloseTo(5 * (1 - Math.exp(-e.time / 1e-3)), 3);
    expect(e.stateAt(2.5e-3)).toBeNull();
  });

  test("reset returns to t = 0", () => {
    const e = createEngine(rc(), lookup);
    runUntil(e, 1e-3);
    e.reset();
    expect(e.time).toBe(0);
    expect(e.displayState()[2]).toBeCloseTo(0, 6);
  });
});
