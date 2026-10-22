// Acceptance circuits run headless through the real pipeline:
// document -> netlist compiler -> engine with the real element models.
import { createEngine, type Engine } from "@cs/engine";
import { createPartResolver } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { importFalstad } from "@cs/formats";
import { compile, type Netlist, type NetlistElement, type PropValue } from "@cs/model";
import { CAP_TXT, LRC_TXT } from "../../packages/formats/test/fixtures";

const settings = { realisticParts: false, realisticRatings: false, start: "zero" as const, seed: 1 };

function netlist(nodeCount: number, els: [string, string, number[], Record<string, PropValue>][]): Netlist {
  const elements: NetlistElement[] = els.map(([id, type, nodes, props]) => ({ id, type, nodes, props }));
  const nodeNames = ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)];
  return { nodeCount, nodeNames, elements, settings };
}

function run(e: Engine, until: number): { times: Float64Array; values: Float64Array } {
  const times: number[] = [];
  const values: number[] = [];
  while (e.time < until) {
    const out = e.step();
    if (!out.ok) throw new Error(`step failed at t=${e.time}: ${JSON.stringify(e.diagnostics)}`);
    const block = e.drainSamples();
    times.push(...block.times);
    values.push(...block.samples.subarray(0, block.times.length));
  }
  return { times: Float64Array.from(times), values: Float64Array.from(values) };
}

const maxIn = (t: Float64Array, v: Float64Array, t0: number, t1: number) => {
  let m = -Infinity;
  for (let i = 0; i < t.length; i++) if (t[i] >= t0 && t[i] <= t1) m = Math.max(m, v[i]);
  return m;
};

describe("acceptance circuits (real element models)", () => {
  test("ideal LC keeps at least 99% amplitude after 100 cycles (SIM-22)", () => {
    const L = 1e-3;
    const C = 1e-6;
    const period = 2 * Math.PI * Math.sqrt(L * C);
    const e = createEngine(
      netlist(1, [
        ["C1", "capacitor", [1, 0], { capacitance: C, initialVoltage: 1 }],
        ["L1", "inductor", [1, 0], { inductance: L }],
      ]),
      getModelFactory,
    );
    e.setChannels([{ id: "v", kind: "voltage", a: 1, b: 0 }]);
    const { times, values } = run(e, 100 * period);
    expect(maxIn(times, values, 99 * period, 100 * period)).toBeGreaterThan(0.99);
  });

  test("half-wave rectifier passes only positive half-cycles", () => {
    const e = createEngine(
      netlist(2, [
        ["V1", "ac-source", [1, 0], { amplitude: 5, frequency: 60, offset: 0, phase: 0 }],
        ["D1", "diode", [1, 2], {}],
        ["R1", "resistor", [2, 0], { resistance: 1000 }],
      ]),
      getModelFactory,
    );
    e.setChannels([{ id: "out", kind: "voltage", a: 2, b: 0 }]);
    const { values } = run(e, 3 / 60);
    const max = Math.max(...values);
    const min = Math.min(...values);
    expect(max).toBeGreaterThan(4.1);
    expect(max).toBeLessThan(4.6);
    expect(min).toBeGreaterThan(-0.01);
  });

  test("LED with series resistor settles near its forward voltage", () => {
    const e = createEngine(
      netlist(2, [
        ["V1", "battery", [1, 0], { voltage: 5 }],
        ["R1", "resistor", [1, 2], { resistance: 220 }],
        ["D1", "led", [2, 0], { color: "red" }],
      ]),
      getModelFactory,
    );
    const v = e.displayState()[2];
    expect(v).toBeGreaterThan(1.5);
    expect(v).toBeLessThan(2.3);
  });

  test("a second circuit with no ground connection still solves exactly", () => {
    const e = createEngine(
      netlist(4, [
        ["V1", "battery", [1, 0], { voltage: 5 }],
        ["R1", "resistor", [1, 0], { resistance: 1000 }],
        // Isolated loop: nodes 2-4 have no path to ground.
        ["V2", "battery", [2, 3], { voltage: 9 }],
        ["R2", "resistor", [2, 4], { resistance: 1000 }],
        ["R3", "resistor", [4, 3], { resistance: 2000 }],
      ]),
      getModelFactory,
    );
    expect(e.status).toBe("ok");
    expect(e.diagnostics.map((d) => d.id)).toEqual(["floating-tied"]);
    const d = e.displayState();
    expect(d[1]).toBeCloseTo(5, 12);
    expect(d[2] - d[4]).toBeCloseTo(3, 9); // 9 V across 1k + 2k: 3 V on R2
    expect(d[4] - d[3]).toBeCloseTo(6, 9);
  });

  test.each([
    ["cap.txt", CAP_TXT],
    ["lrc.txt", LRC_TXT],
  ])("Falstad %s imports, compiles without errors, and runs", (_name, text) => {
    const { doc } = importFalstad(text);
    const compiled = compile(doc, createPartResolver());
    expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const e = createEngine(compiled.netlist, getModelFactory);
    run(e, 0.02);
    expect(e.status).toBe("ok");
    expect(e.displayState().every(Number.isFinite)).toBe(true);
  });
});
