// Mixed-signal acceptance circuits with the real logic parts
// (simulation-engine.md §4, spec §17): netlist -> engine -> real models.
import { createEngine, type Engine } from "@cs/engine";
import { createPartResolver } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import type { Netlist, NetlistElement, PropValue } from "@cs/model";
import { decodeDiscrete, decodeFrame, encodeFrame } from "@cs/worker";

const settings = { realisticParts: false, realisticRatings: false, start: "zero" as const, seed: 1 };

function netlist(nodeCount: number, els: [string, string, number[], Record<string, PropValue>][]): Netlist {
  const elements: NetlistElement[] = els.map(([id, type, nodes, props]) => ({ id, type, nodes, props }));
  const nodeNames = ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)];
  return { nodeCount, nodeNames, elements, settings };
}

interface Run {
  times: number[];
  /** Channel-major samples. */
  ch: number[][];
  steps: number;
}

function run(e: Engine, until: number, acc?: Run): Run {
  const r = acc ?? { times: [], ch: e.channelIds.map(() => []), steps: 0 };
  while (e.time < until) {
    const out = e.step();
    if (!out.ok) throw new Error(`step failed at t=${e.time}: ${JSON.stringify(e.diagnostics)}`);
    r.steps++;
  }
  const b = e.drainSamples();
  const n = b.times.length;
  r.times.push(...b.times);
  r.ch.forEach((col, k) => col.push(...b.samples.subarray(k * n, (k + 1) * n)));
  return r;
}

/** Value of channel k at time t: the last sample at or before t. */
function at(r: Run, k: number, t: number): number {
  let v = NaN;
  for (let i = 0; i < r.times.length && r.times[i] <= t; i++) v = r.ch[k][i];
  return v;
}

function firstEdge(r: Run, k: number, after: number): { t: number; v: number } | undefined {
  for (let i = 1; i < r.times.length; i++)
    if (r.times[i] > after && r.ch[k][i] !== r.ch[k][i - 1]) return { t: r.times[i], v: r.ch[k][i] };
  return undefined;
}

/** 3-bit ripple counter: clock -> three D flip-flops wired as toggles (D = Q̄). */
function counter(delay: number): Netlist {
  // Nodes: 1 clk; FFk: Q = 3+2k... laid out explicitly below; 8..13 unconnected S/R.
  const ff = (id: string, d: number, clk: number, q: number, qb: number, s: number, r: number) =>
    [id, "d-flip-flop", [d, clk, q, qb, s, r], { delay }] as [string, string, number[], Record<string, PropValue>];
  return netlist(13, [
    ["CLK", "clock", [1], { frequency: 1e6 }],
    ff("U0", 2, 1, 3, 2, 8, 9),
    ff("U1", 5, 2, 4, 5, 10, 11),
    ff("U2", 7, 5, 6, 7, 12, 13),
  ]);
}

const COUNTER_CHANNELS = [3, 4, 6].map((node, k) => ({ id: `q${k}`, kind: "logic" as const, node }));
const count = (r: Run, t: number) => at(r, 0, t) + 2 * at(r, 1, t) + 4 * at(r, 2, t);

describe("digital acceptance circuits (real logic parts)", () => {
  test("logic parts are registered with digital pins for the compiler", () => {
    const resolver = createPartResolver();
    expect(resolver.traits("d-flip-flop").digitalPins).toEqual([0, 1, 2, 3, 4, 5]);
    expect(resolver.traits("and-gate").digitalPins).toEqual([0, 1, 2]);
    expect(resolver.traits("resistor").digitalPins).toBeUndefined();
  });

  test("a ripple counter of D flip-flops counts clock edges", () => {
    const e = createEngine(counter(0), getModelFactory);
    e.setChannels(COUNTER_CHANNELS);
    const r = run(e, 10.9e-6);
    for (let k = 0; k <= 10; k++) expect(count(r, k * 1e-6 + 0.75e-6)).toBe(k % 8);
    // Pure digital: one step per event time, nowhere near period/50 steps.
    expect(r.steps).toBeLessThan(100);
  });

  test("10 ns flip-flop delays ripple through false states (acceptance 18)", () => {
    const e = createEngine(counter(10e-9), getModelFactory);
    e.setChannels(COUNTER_CHANNELS);
    const r = run(e, 4.5e-6);
    // 3 -> 4 at the rising edge at 4 µs: 3, 2, 0, then 4, 10 ns apart.
    expect(count(r, 4e-6 + 5e-9)).toBe(3);
    expect(count(r, 4e-6 + 15e-9)).toBe(2);
    expect(count(r, 4e-6 + 25e-9)).toBe(0);
    expect(count(r, 4e-6 + 35e-9)).toBe(4);
    const q2 = firstEdge(r, 2, 3.9e-6)!;
    expect(q2.t).toBeCloseTo(4e-6 + 30e-9, 14);
  });

  test("a gate drives an RC load through its output resistance (DIG-04)", () => {
    const R = 1000;
    const C = 1e-6;
    const tau = (R + 25) * C; // default 25 Ω output resistance
    const e = createEngine(
      netlist(3, [
        ["IN", "logic-input", [1], { high: true }],
        ["U1", "not-gate", [1, 2], {}],
        ["R1", "resistor", [2, 3], { resistance: R }],
        ["C1", "capacitor", [3, 0], { capacitance: C }],
      ]),
      getModelFactory,
    );
    e.setChannels([{ id: "vc", kind: "voltage", a: 3, b: 0 }]);
    run(e, 1e-4);
    const t0 = e.time;
    expect(e.displayState()[3]).toBeCloseTo(0, 6);
    e.setParams([{ element: "IN", param: "high", value: false }]);
    e.drainSamples();
    const r = run(e, t0 + 5 * tau);
    let maxErr = 0;
    r.times.forEach((t, i) => {
      const ref = 5 * (1 - Math.exp(-(t - t0) / tau));
      maxErr = Math.max(maxErr, Math.abs(r.ch[0][i] - ref));
    });
    expect(maxErr).toBeLessThan(0.01 * 5);
  });

  test("an analog sine into a gate input switches at the threshold (A→D)", () => {
    const sine = (schmitt: boolean) => {
      const e = createEngine(
        netlist(2, [
          ["V1", "ac-source", [1, 0], { amplitude: 5, frequency: 50, offset: 0, phase: 0 }],
          ["U1", "not-gate", [1, 2], { schmitt }],
        ]),
        getModelFactory,
      );
      e.setChannels([{ id: "y", kind: "logic", node: 2 }]);
      return firstEdge(run(e, 8e-3), 0, 0)!;
    };
    const plain = sine(false);
    expect(plain.v).toBe(0);
    const tPlain = Math.asin(0.5) / (2 * Math.PI * 50); // 2.5 V
    expect(Math.abs(plain.t - tPlain) / tPlain).toBeLessThan(1e-3);
    const schmitt = sine(true);
    const tSchmitt = Math.asin(0.6) / (2 * Math.PI * 50); // 3 V rising threshold
    expect(Math.abs(schmitt.t - tSchmitt) / tSchmitt).toBeLessThan(1e-3);
  });

  test("10 ns delays are honored without forcing 10 ns steps when idle", () => {
    const e = createEngine(
      netlist(5, [
        ["IN", "logic-input", [1], { high: false }],
        ["U1", "not-gate", [1, 2], { delay: 10e-9 }],
        ["U2", "not-gate", [2, 3], { delay: 10e-9 }],
        ["OUT", "logic-output", [3], {}],
        // An unrelated analog RC (τ = 1 ms) keeps the engine in mixed mode.
        ["V1", "dc-source", [4, 0], { voltage: 5 }],
        ["R1", "resistor", [4, 5], { resistance: 1000 }],
        ["C1", "capacitor", [5, 0], { capacitance: 1e-6 }],
      ]),
      getModelFactory,
    );
    e.setChannels([
      { id: "out", kind: "logic", node: 3 },
      { id: "vc", kind: "voltage", a: 5, b: 0 },
    ]);
    const r = run(e, 5e-3);
    const tToggle = e.time;
    e.setParams([{ element: "IN", param: "high", value: true }]);
    run(e, 20e-3, r);
    const edge = firstEdge(r, 0, tToggle)!;
    expect(edge.v).toBe(1);
    expect(edge.t - tToggle).toBeCloseTo(20e-9, 15);
    expect(r.steps).toBeLessThan(3000); // 20 ms / 10 ns would be 2,000,000
    expect(at(r, 1, 20e-3)).toBeGreaterThan(4.99);
    expect(e.readouts("OUT").state).toBe(1);
  });

  test("a JK flip-flop with J = K = 1 divides the clock by two", () => {
    const e = createEngine(
      netlist(5, [
        ["CLK", "clock", [1], { frequency: 1e3 }],
        ["H", "logic-input", [2], { high: true }],
        ["U1", "jk-flip-flop", [2, 1, 2, 3, 4], {}],
        ["G", "xor-gate", [3, 4, 5], {}],
      ]),
      getModelFactory,
    );
    e.setChannels([
      { id: "q", kind: "logic", node: 3 },
      { id: "x", kind: "logic", node: 5 },
    ]);
    const r = run(e, 6.5e-3);
    for (let k = 1; k <= 6; k++) expect(at(r, 0, k * 1e-3 + 0.25e-3)).toBe(k % 2);
    expect(r.ch[1].slice(1).every((v) => v === 1)).toBe(true); // Q xor Q̄
  });

  test("mixed runs are deterministic and frames carry logic states", () => {
    const go = () => {
      const e = createEngine(
        netlist(16, [
          ...counter(10e-9).elements.map((el) => [el.id, el.type, el.nodes, el.props] as [string, string, number[], Record<string, PropValue>]),
          ["R1", "resistor", [3, 14], { resistance: 1000 }],
          ["C1", "capacitor", [14, 0], { capacitance: 1e-9 }],
          ["U9", "and-gate", [14, 4, 15], {}],
          ["R2", "resistor", [15, 16], { resistance: 100 }],
          ["C2", "capacitor", [16, 0], { capacitance: 1e-9 }],
        ]),
        getModelFactory,
      );
      e.setChannels([
        { id: "v", kind: "voltage", a: 16, b: 0 },
        { id: "q", kind: "logic", node: 15 },
      ]);
      return { e, r: run(e, 8e-6) };
    };
    const a = go();
    const b = go();
    expect(a.r.times).toEqual(b.r.times);
    expect(a.r.ch).toEqual(b.r.ch);
    expect(Math.max(...a.r.ch[0])).toBeGreaterThan(4);

    const states = a.e.logicStates();
    expect(states.length).toBe(17);
    expect(states[0]).toBe(255); // ground has no digital pins
    expect(states[8]).toBe(3); // unconnected set input: Z
    const display = a.e.displayState();
    const buf = encodeFrame(
      {
        frame: 1,
        t0: 0,
        t1: a.e.time,
        runState: "paused",
        effectiveSpeed: 1,
        slowerThanRequested: false,
        channelIds: [],
        times: new Float64Array(0),
        samples: new Float64Array(0),
        display,
        events: [],
      },
      states,
    );
    expect(Array.from(decodeDiscrete(buf))).toEqual(Array.from(states));
    expect(Array.from(decodeFrame(buf).display)).toEqual(Array.from(display));
  });
});
