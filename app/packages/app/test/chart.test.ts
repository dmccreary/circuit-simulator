import { createDocument, type CircuitDocument } from "@cs/model";
import { createHistoryStore } from "@cs/history";
import { lightTheme } from "@cs/render";
import type { Command, Frame, WorkerMessage } from "@cs/worker";
import { AppController } from "../src/controller";
import { rcChargingCircuit } from "../src/demo-circuit";
import { SimClient, type WorkerPort } from "../src/sim/sim-client";
import { buildChartLanes } from "../src/chart/lanes";
import {
  addLane,
  addMeasurement,
  moveLane,
  moveProbeToLane,
  removeLane,
  removeMeasurement,
  setLaneHeights,
  setLaneKind,
  setLaneScale,
} from "../src/chart/lane-edits";
import { measureWindow } from "../src/chart/measure";

function docWithProbes(): CircuitDocument {
  const d = rcChargingCircuit();
  const p1 = d.probes.P1;
  d.lanes.push({ id: "L2", kind: "analog" });
  d.probes.P2 = { ...p1, id: "P2", name: "I(R1)", quantity: "current", lane: "L2", measurements: [] };
  return d;
}

describe("lane edits", () => {
  test("add, reorder, change kind and scale, resize", () => {
    const d = docWithProbes();
    addLane(d, "L3", "logic");
    expect(d.lanes.map((l) => l.id)).toEqual(["L1", "L2", "L3"]);
    moveLane(d, "L3", -1);
    expect(d.lanes.map((l) => l.id)).toEqual(["L1", "L3", "L2"]);
    moveLane(d, "L1", -1); // already first
    expect(d.lanes[0].id).toBe("L1");
    setLaneKind(d, "L1", "logic");
    expect(d.lanes[0].kind).toBe("logic");
    setLaneScale(d, "L2", { mode: "fixed", min: 0, max: 5 });
    expect(d.lanes[2].yScale).toEqual({ mode: "fixed", min: 0, max: 5 });
    setLaneScale(d, "L2", { mode: "fixed", min: 5, max: 0 }); // invalid: ignored
    expect(d.lanes[2].yScale).toEqual({ mode: "fixed", min: 0, max: 5 });
    setLaneScale(d, "L2", { mode: "auto" });
    expect(d.lanes[2].yScale).toEqual({ mode: "auto" });
    setLaneHeights(d, [80.4, 150, -1]);
    expect(d.lanes.map((l) => l.height)).toEqual([80, 150, undefined]);
  });

  test("removing a lane moves its probes; the last lane stays", () => {
    const d = docWithProbes();
    removeLane(d, "L2");
    expect(d.lanes.map((l) => l.id)).toEqual(["L1"]);
    expect(d.probes.P2.lane).toBe("L1");
    removeLane(d, "L1");
    expect(d.lanes).toHaveLength(1);
  });

  test("moving a probe to a new lane creates it", () => {
    const d = docWithProbes();
    moveProbeToLane(d, "P1", "L9");
    expect(d.lanes.map((l) => l.id)).toContain("L9");
    expect(d.probes.P1.lane).toBe("L9");
  });

  test("measurements are stored on the probe once each", () => {
    const d = docWithProbes();
    addMeasurement(d, "P1", "rms");
    addMeasurement(d, "P1", "rms");
    addMeasurement(d, "P1", "frequency");
    expect(d.probes.P1.measurements.map((m) => m.kind)).toEqual(["rms", "frequency"]);
    removeMeasurement(d, "P1", "rms");
    expect(d.probes.P1.measurements.map((m) => m.kind)).toEqual(["frequency"]);
  });
});

describe("chart lanes from the document", () => {
  test("each lane gets its probes, units, scale and ghosts", () => {
    const d = docWithProbes();
    d.lanes[0].yScale = { mode: "fixed", min: 0, max: 10 };
    d.lanes[0].height = 90;
    const lanes = buildChartLanes(d, (id) => `ch:${id}`, lightTheme, [{ id: "ghost:1", probeId: "P1", label: "V(C1) (kept 1)" }]);
    expect(lanes.map((l) => l.id)).toEqual(["L1", "L2"]);
    expect(lanes[0]).toMatchObject({ unit: "V", height: 90, yScale: { mode: "fixed", min: 0, max: 10 }, kind: "analog" });
    expect(lanes[0].traces.map((t) => [t.channelId, !!t.ghost])).toEqual([
      ["ch:P1", false],
      ["ghost:1", true],
    ]);
    expect(lanes[1].unit).toBe("A");
    expect(buildChartLanes(createDocument(), (id) => id, lightTheme)).toEqual([]);
  });
});

function frame(t: number[], v: number[], runState: Frame["runState"] = "paused", n = 0): Frame {
  return {
    frame: n,
    t0: t[0],
    t1: t[t.length - 1],
    runState,
    effectiveSpeed: 1,
    slowerThanRequested: false,
    channelIds: ["P1"],
    times: Float64Array.from(t),
    samples: Float64Array.from(v),
    display: new Float64Array(8),
    events: [],
  };
}

describe("scrubbing through the sim client", () => {
  function fakePort() {
    const sent: Command[] = [];
    const port: WorkerPort = { postMessage: (m) => void sent.push(m), onmessage: null };
    const reply = (m: WorkerMessage) => port.onmessage?.({ data: m } as MessageEvent<WorkerMessage>);
    return { sent, port, reply };
  }

  test("getStateAt resolves with the reply that matches its request id", async () => {
    const { sent, port, reply } = fakePort();
    const client = new SimClient(
      port,
      { compile: () => ({}) as never, classify: () => "none", paramChanges: () => [], decodeFrame: () => ({}) as never },
      {},
    );
    const p1 = client.getStateAt(0.25);
    const p2 = client.getStateAt(0.5);
    const [r1, r2] = sent.filter((c): c is Extract<Command, { type: "getStateAt" }> => c.type === "getStateAt");
    expect(r1.t).toBe(0.25);
    expect(r1.requestId).not.toBe(r2.requestId);
    reply({ type: "stateAt", requestId: r2.requestId, t: 0.5, display: null });
    reply({ type: "stateAt", requestId: r1.requestId, t: 0.25, display: Float32Array.from([0, 1.5]) });
    const a = await p1;
    expect(a?.display).toBeInstanceOf(Float64Array);
    expect(Array.from(a!.display)).toEqual([0, 1.5]);
    expect(await p2).toBeNull();
    client.restartFrom(0.25);
    expect(sent.at(-1)).toEqual({ type: "restartFrom", t: 0.25 });
  });

  test("the playhead requests state, reports missing history, and restarts from there", async () => {
    const { sent, port, reply } = fakePort();
    const c = new AppController(rcChargingCircuit(), { worker: port });
    c.bus.publish(frame([0, 0.5, 1, 1.5, 2], [0, 1, 2, 3, 4]));
    const s = c.chartSession;
    expect(s.canScrub).toBe(true);

    s.scrubTo(1);
    expect(s.ui.get().scrubbing).toBe(true);
    const req = sent.at(-1) as Extract<Command, { type: "getStateAt" }>;
    expect(req).toMatchObject({ type: "getStateAt", t: 1 });
    reply({ type: "stateAt", requestId: req.requestId, t: 1, display: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(s.ui.get().historyMissing).toBe(true);

    // Paused frames keep arriving; the playhead stays where the student put it.
    c.bus.publish(frame([], [], "paused", 1));
    expect(s.model.playhead ?? 1).toBe(1);

    s.restartHere();
    expect(sent.some((m) => m.type === "restartFrom" && m.t === 1)).toBe(true);
    expect(c.history.timeRange()?.t1).toBeLessThanOrEqual(1);
    expect(s.ui.get().scrubbing).toBe(false);
    c.dispose();
  });

  test("scrubbing to the newest moment or pressing Run ends the scrub", () => {
    const { port } = fakePort();
    const c = new AppController(rcChargingCircuit(), { worker: port });
    c.bus.publish(frame([0, 1, 2], [0, 1, 2]));
    c.chartSession.scrubTo(0.5);
    expect(c.chartSession.ui.get().scrubbing).toBe(true);
    c.chartSession.scrubTo(5);
    expect(c.chartSession.ui.get().scrubbing).toBe(false);
    c.chartSession.scrubTo(0.5);
    c.run();
    expect(c.chartSession.ui.get().scrubbing).toBe(false);
    expect(c.chartSession.canScrub).toBe(false);
    c.dispose();
  });

  test("keep trace adds a labelled ghost to the probe's lane; clear removes it", () => {
    const { port } = fakePort();
    const c = new AppController(rcChargingCircuit(), { worker: port });
    c.chartSession.keepTraces(); // no history yet: nothing kept
    expect(c.chartSession.ghosts).toHaveLength(0);
    c.bus.publish(frame([0, 1, 2], [0, 1, 2]));
    c.chartSession.keepTraces();
    expect(c.chartSession.ghosts).toHaveLength(1);
    const lane = c.chartLanes()[0];
    const ghost = lane.traces.find((t) => t.ghost)!;
    expect(ghost.name).toContain("kept 1");
    expect(c.history.view(ghost.channelId, 0, 2).length).toBe(3);
    c.reset();
    expect(c.chartSession.ghosts).toHaveLength(1); // ghosts survive Reset
    c.chartSession.clearGhosts();
    expect(c.chartLanes()[0].traces.some((t) => t.ghost)).toBe(false);
    c.dispose();
  });

  test("fit to circuit uses the worker's time scales", () => {
    const { port, reply } = fakePort();
    const c = new AppController(rcChargingCircuit(), { worker: port });
    expect(c.chartSession.fitToCircuit()).toBe(false);
    reply({ type: "timeScales", timeScales: { fastest: 1e-6, dominant: 1e-3, sourcePeriods: [], kind: "transient" } });
    expect(c.chartSession.fitToCircuit()).toBe(true);
    expect(c.chartSession.ui.get().span).toBeCloseTo(5e-3);
    c.dispose();
  });
});

describe("measurements over a window", () => {
  test("square wave: mean, peak-to-peak, frequency, duty cycle", () => {
    const h = createHistoryStore();
    const t: number[] = [];
    const v: number[] = [];
    for (let i = 0; i <= 4000; i++) {
      const tt = i * 1e-3; // 4 s, 1 ms steps
      t.push(tt);
      v.push(tt % 1 < 0.25 ? 5 : 0); // 1 Hz, 25 % duty
    }
    h.append(frame(t, v, "running"));
    const r = measureWindow(h, "P1", 0, 4, ["mean", "peakToPeak", "frequency", "dutyCycle", "bogus"]);
    expect(r.peakToPeak).toMatchObject({ ok: true, value: 5 });
    expect(r.mean.ok && r.mean.value).toBeCloseTo(1.25, 1);
    expect(r.frequency.ok && r.frequency.value).toBeCloseTo(1, 2);
    expect(r.dutyCycle.ok && r.dutyCycle.value).toBeCloseTo(0.25, 2);
    expect(r.bogus.ok).toBe(false);
    expect(measureWindow(h, "nope", 0, 4, ["mean"]).mean.ok).toBe(false);
  });
});
