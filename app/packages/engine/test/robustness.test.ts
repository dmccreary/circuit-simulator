// Engine robustness (simulation-engine.md §2.3–§2.5, §3): singular-matrix repair,
// Newton rescue, time-scale estimates, and the DC power balance's solver leakage.
import { computeTimeScales, createEngine, runAnalysisSync, MnaSystem, type DcResult } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import type { Netlist, NetlistElement, PropValue } from "@cs/model";
import { buildCircuit } from "../src/circuit";
import { floatingGroups } from "../src/floating";
import { stampStatic, stampStep } from "../src/stamping";

type El = [string, string, number[], Record<string, PropValue>];

function netlist(nodeCount: number, els: El[]): Netlist {
  const elements: NetlistElement[] = els.map(([id, type, nodes, props]) => ({ id, type, nodes, props }));
  const nodeNames = ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)];
  return { nodeCount, nodeNames, elements, settings: { realisticParts: false, realisticRatings: false, start: "zero", seed: 1 } };
}

function run(n: Netlist, until: number, maxSteps = 200_000) {
  const e = createEngine(n, getModelFactory);
  for (let k = 0; k < maxSteps && e.time < until && e.status === "ok"; k++) {
    if (!e.step().ok) break;
  }
  return e;
}

describe("floating groups (floating.ts)", () => {
  function groups(n: Netlist): number[][] {
    const c = buildCircuit(n, getModelFactory);
    const sys = new MnaSystem(c.size);
    stampStatic(c, sys);
    stampStep(c, sys, { kind: "transient", t: 0, dt: 1e-9, method: "be", gmin: 1e-12, sourceScale: 1 }, null, 0);
    return floatingGroups(sys, c.nodeCount, []);
  }

  test("a transformer secondary with no ground floats; the primary does not", () => {
    const n = netlist(3, [
      ["V1", "ac-source", [1, 0], { amplitude: 10, frequency: 60 }],
      ["T1", "transformer", [1, 0, 2, 3], { inductance: 1, ratio: 1, coupling: 0.99 }],
      ["R1", "resistor", [2, 3], { resistance: 100 }],
    ]);
    expect(groups(n)).toEqual([[2, 3]]);
  });

  test("a rail's node is anchored even when every other part on it is off", () => {
    const n = netlist(2, [
      ["V1", "rail", [1], { waveform: "dc", voltage: 15 }],
      ["M1", "n-mosfet", [0, 1, 2], {}],
      ["R1", "resistor", [2, 0], { resistance: 1000 }],
    ]);
    expect(groups(n)).toEqual([]);
  });
});

describe("singular and stubborn circuits", () => {
  test("a floating source section found mid-run is tied and the step is retried", () => {
    // Two caps in series across an ungrounded battery: the middle node is held only by
    // the capacitors, the whole section by nothing (CircuitJS1 runs it).
    const e = run(
      netlist(3, [
        ["V1", "battery", [1, 2], { voltage: 5 }],
        ["C1", "capacitor", [1, 3], { capacitance: 1e-6 }],
        ["C2", "capacitor", [3, 2], { capacitance: 1e-6 }],
      ]),
      0.01,
    );
    expect(e.status).toBe("ok");
    expect(e.time).toBeGreaterThanOrEqual(0.01);
  });

  test("an op-amp driving a MOSFET follower converges at t = 0 (gmin, source and pseudo-transient rescue)", () => {
    // Op-amp output on the gate, the source fed back to "−": the loop gain is 10⁵ and the
    // MOSFET starts off, so plain Newton bounces the output between the rails.
    const e = run(
      netlist(5, [
        ["V1", "rail", [1], { waveform: "dc", voltage: 2 }],
        ["U1", "op-amp", [3, 1, 2], { gain: 1e5, maxOutput: 15, minOutput: -15 }],
        ["M1", "n-mosfet", [2, 4, 3], {}],
        ["R1", "resistor", [3, 5], { resistance: 100 }],
        ["V2", "rail", [4], { waveform: "dc", voltage: 10 }],
        ["V3", "rail", [5], { waveform: "dc", voltage: -10 }],
      ]),
      0.01,
    );
    expect(e.status).toBe("ok");
    const v = e.displayState();
    expect(v[3]).toBeCloseTo(2, 3); // the follower's source sits at the reference
  });

  test("a two-inverter latch closed through analog nodes settles instead of oscillating", () => {
    const e = run(
      netlist(3, [
        ["U1", "not-gate", [1, 2], { supply: 5 }],
        ["R1", "resistor", [2, 3], { resistance: 100 }],
        ["U2", "not-gate", [3, 1], { supply: 5 }],
      ]),
      0.001,
    );
    expect(e.status).toBe("ok");
    const v = e.displayState();
    expect(Math.abs(v[1] - v[2])).toBeGreaterThan(4); // complementary outputs
  });
});

describe("time scales (timescales.ts)", () => {
  const scales = (n: Netlist) => computeTimeScales(buildCircuit(n, getModelFactory), new Float64Array(n.nodeCount + 4), 0);

  test("an LC tank's dominant time is its period, not its gmin leakage decay", () => {
    const ts = scales(
      netlist(1, [
        ["L1", "inductor", [1, 0], { inductance: 0.1 }],
        ["C1", "capacitor", [1, 0], { capacitance: 1e-6 }],
      ]),
    );
    const period = 2 * Math.PI * Math.sqrt(0.1 * 1e-6);
    expect(ts.dominant).toBeCloseTo(period, 6);
    expect(ts.fastest).toBeCloseTo(period, 6);
  });

  test("an inductor into an open junction (a gmin-held node) adds no fast time scale", () => {
    const ts = scales(
      netlist(2, [
        ["V1", "battery", [1, 0], { voltage: 5 }],
        ["L1", "inductor", [1, 2], { inductance: 1 }],
        ["D1", "diode", [0, 2], {}],
      ]),
    );
    expect(ts.fastest === 0 || ts.fastest > 1e-6).toBe(true);
  });

  test("a decay 10⁴ times faster than the source period does not limit the step", () => {
    const ts = scales(
      netlist(3, [
        ["V1", "ac-source", [1, 0], { amplitude: 1, frequency: 50 }],
        ["R1", "resistor", [1, 2], { resistance: 1000 }],
        ["C1", "capacitor", [2, 0], { capacitance: 1e-3 }], // τ = 1 s
        ["R2", "resistor", [2, 3], { resistance: 1 }],
        ["C2", "capacitor", [3, 0], { capacitance: 1e-9 }], // τ ≈ 1 ns: stiff
      ]),
    );
    expect(ts.fastest).toBeCloseTo(0.02, 9);
  });
});

describe("DC power balance (dc-table.ts)", () => {
  test("an open circuit balances: the gmin shunts are reported as solver leakage", () => {
    const n = netlist(2, [
      ["V1", "battery", [1, 0], { voltage: 5 }],
      ["R1", "resistor", [1, 2], { resistance: 1000 }],
    ]);
    const r = runAnalysisSync({ kind: "dc", netlist: n }, getModelFactory) as DcResult;
    expect(r.ok).toBe(true);
    expect(r.powerLeakage).toBeGreaterThan(0);
    expect(Math.abs(r.powerDelivered - r.powerAbsorbed)).toBeLessThan(1e-6 * r.powerDelivered);
  });
});
