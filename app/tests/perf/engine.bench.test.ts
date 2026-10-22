// Engine throughput benchmark (spec test 22: a 150-part circuit must keep
// up at 30 fps). Runs the generated ladder (ladder.ts) headless and prints
// steps per second and wall milliseconds per simulated millisecond. The
// floors are deliberately generous so a slow CI machine does not flake; the
// printed numbers are what to compare between changes.

import { createEngine, type Engine } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import { ladderNetlist } from "./ladder";

interface BenchResult {
  parts: number;
  unknowns: number;
  steps: number;
  stepsPerSecond: number;
  /** Wall milliseconds per simulated millisecond. */
  msPerSimMs: number;
  /** Wall milliseconds to build the engine and solve t = 0. */
  loadMs: number;
}

function bench(parts: number, budgetMs: number, maxSteps: number): BenchResult {
  const nl = ladderNetlist(parts);
  const t0 = performance.now();
  const e: Engine = createEngine(nl, getModelFactory);
  const loadMs = performance.now() - t0;
  e.setChannels([{ id: "out", kind: "voltage", a: nl.nodeCount, b: 0 }]);
  // Warm up the JIT and the solver's ordering.
  for (let i = 0; i < 20; i++) e.step();
  const simStart = e.time;
  const start = performance.now();
  let steps = 0;
  while (steps < maxSteps && performance.now() - start < budgetMs) {
    const out = e.step();
    if (!out.ok) throw new Error(`step failed: ${JSON.stringify(e.diagnostics)}`);
    e.drainSamples();
    steps++;
  }
  const wall = performance.now() - start;
  const sim = (e.time - simStart) * 1000;
  return {
    parts: nl.elements.length,
    unknowns: e.displaySize,
    steps,
    stepsPerSecond: (steps * 1000) / wall,
    msPerSimMs: sim > 0 ? wall / sim : Infinity,
    loadMs,
  };
}

function report(r: BenchResult): void {
  console.log(
    `[bench] ${r.parts} parts: ${r.stepsPerSecond.toFixed(0)} steps/s, ` +
      `${r.msPerSimMs.toFixed(2)} ms per simulated ms, load ${r.loadMs.toFixed(1)} ms (${r.steps} steps, display ${r.unknowns})`,
  );
}

describe("engine benchmark (generated RC/diode/transistor ladder)", () => {
  test("150-part ladder", () => {
    const r = bench(150, 1500, 20000);
    report(r);
    // A 30 fps frame has ~8 ms of compute; one step per frame is the bare minimum.
    expect(r.stepsPerSecond).toBeGreaterThan(125);
  }, 60000);

  test("500-part ladder", () => {
    const r = bench(500, 1500, 20000);
    report(r);
    expect(r.stepsPerSecond).toBeGreaterThan(10);
  }, 60000);
});
