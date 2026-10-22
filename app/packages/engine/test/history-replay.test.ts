// History ring option C (simulation-engine.md §7.4): above the memory budget
// the engine keeps checkpoints and re-simulates; the replay must be exact.
import { createEngine, type Engine } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import type { Netlist } from "@cs/model";
import { ladderNetlist } from "../../../tests/perf/ladder";

const settings = { realisticParts: false, realisticRatings: false, start: "zero" as const, seed: 1 };

function rcDiode(): Netlist {
  return {
    nodeCount: 3,
    nodeNames: ["GND", "N1", "N2", "N3"],
    settings,
    elements: [
      { id: "V1", type: "square-source", nodes: [1, 0], props: { amplitude: 5, frequency: 2000 } },
      { id: "R1", type: "resistor", nodes: [1, 2], props: { resistance: 1000 } },
      { id: "C1", type: "capacitor", nodes: [2, 0], props: { capacitance: 1e-7 } },
      { id: "D1", type: "diode", nodes: [2, 3], props: {} },
      { id: "R2", type: "resistor", nodes: [3, 0], props: { resistance: 2200 } },
    ],
  };
}

function runSteps(e: Engine, n: number): number[] {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    expect(e.step().ok).toBe(true);
    times.push(e.time);
  }
  return times;
}

const bits = (a: Float32Array | null) => (a ? Array.from(new Uint32Array(a.buffer, a.byteOffset, a.length)) : null);

describe.each([
  ["dense RC + diode", rcDiode, 700],
  ["sparse 60-part ladder", () => ladderNetlist(60), 400],
])("checkpoint history: %s", (_name, make, steps) => {
  test("stateAt by re-simulation equals the full ring bit for bit", () => {
    const full = createEngine(make(), getModelFactory);
    // A budget far too small for display states forces checkpoint mode.
    const replay = createEngine(make(), getModelFactory, { historyBudgetBytes: 200_000 });
    const times = runSteps(full, steps);
    expect(runSteps(replay, steps)).toEqual(times);
    for (const i of [0, 1, 17, 255, 256, 257, Math.floor(steps / 2), steps - 2, steps - 1]) {
      const t = times[i];
      expect(bits(replay.stateAt(t))).toEqual(bits(full.stateAt(t)));
      // Between steps: the latest step at or before t.
      const mid = (times[i] + (times[i + 1] ?? times[i])) / 2;
      expect(bits(replay.stateAt(mid))).toEqual(bits(full.stateAt(mid)));
    }
    expect(replay.stateAt(-1)).toBeNull();
  });

  test("a scrub does not disturb the live run", () => {
    const a = createEngine(make(), getModelFactory, { historyBudgetBytes: 200_000 });
    const b = createEngine(make(), getModelFactory, { historyBudgetBytes: 200_000 });
    runSteps(a, steps);
    runSteps(b, steps);
    a.stateAt(a.time / 3);
    a.stateAt(a.time / 2);
    runSteps(a, 50);
    runSteps(b, 50);
    expect(Array.from(a.displayState())).toEqual(Array.from(b.displayState()));
    expect(a.time).toBe(b.time);
  });

  test("back-fills a new probe's trace from the history", () => {
    const full = createEngine(make(), getModelFactory);
    const replay = createEngine(make(), getModelFactory, { historyBudgetBytes: 200_000 });
    runSteps(full, steps);
    runSteps(replay, steps);
    const spec = [{ id: "v2", kind: "voltage" as const, a: 2, b: 0 }];
    const fb = full.backfill(spec);
    const rb = replay.backfill(spec);
    expect(fb.channelIds).toEqual(["v2"]);
    expect(fb.times.length).toBeGreaterThanOrEqual(steps);
    expect(rb.times.length).toBe(steps + 1);
    // Re-simulated values are double precision; the ring holds single precision.
    const last = rb.times.length - 1;
    expect(rb.times[last]).toBe(full.time);
    expect(Math.fround(rb.samples[last])).toBe(fb.samples[fb.times.length - 1]);
    expect(rb.samples[last]).toBe(replay.displayState()[2]);
  });
});
