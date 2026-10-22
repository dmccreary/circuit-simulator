import { decodeFrame, encodeFrame, EngineHost, type Frame, type WorkerMessage } from "@cs/worker";
import { lookup, netlist } from "../../engine/test/fixtures/models";

test("frame encode/decode round-trip", () => {
  const f: Frame = {
    frame: 7,
    t0: 0.001,
    t1: 0.0025,
    runState: "running",
    effectiveSpeed: 0.25,
    slowerThanRequested: true,
    channelIds: ["a", "b"],
    times: Float64Array.from([0.001, 0.002, 0.0025]),
    samples: Float64Array.from([1, 2, 3, -1, -2, -3]),
    display: Float64Array.from([0, 5, 2.5, 1e-3]),
    events: [{ t: 0.002, kind: "paramChanged", element: "R1", detail: "resistance" }],
  };
  const g = decodeFrame(encodeFrame(f));
  expect(g.frame).toBe(7);
  expect(g.t0).toBe(0.001);
  expect(g.t1).toBe(0.0025);
  expect(g.runState).toBe("running");
  expect(g.effectiveSpeed).toBe(0.25);
  expect(g.slowerThanRequested).toBe(true);
  expect(g.channelIds).toEqual(["a", "b"]);
  expect(Array.from(g.times)).toEqual(Array.from(f.times));
  expect(Array.from(g.samples)).toEqual(Array.from(f.samples));
  expect(Array.from(g.display)).toEqual(Array.from(f.display));
  expect(g.events).toEqual(f.events);
});

function harness() {
  let now = 0;
  const tasks: { at: number; fn: () => void }[] = [];
  const posted: WorkerMessage[] = [];
  const host = new EngineHost({
    now: () => now,
    schedule: (fn, delay) => tasks.push({ at: now + delay, fn }),
    post: (m) => posted.push(m),
    getModelFactory: lookup,
  });
  /** Advance fake time, running due tasks in order. */
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      tasks.sort((a, b) => a.at - b.at);
      const next = tasks[0];
      if (!next || next.at > end) break;
      tasks.shift();
      now = Math.max(now, next.at);
      next.fn();
    }
    now = end;
  };
  const frames = () => posted.filter((m) => m.type === "frame").map((m) => decodeFrame((m as { buffer: ArrayBuffer }).buffer));
  return { host, posted, advance, frames, ack: (n: number) => host.handle({ type: "ackFrame", frame: n }) };
}

const rc = () =>
  netlist(2, [
    ["V1", "vsource", [1, 0], { voltage: 5 }],
    ["R1", "resistor", [1, 2], { resistance: 1000 }],
    ["C1", "capacitor", [2, 0], { capacitance: 1e-6 }],
  ]);

test("host loads paused at t = 0 with the solution computed, then steps", () => {
  const h = harness();
  h.host.handle({ type: "load", netlist: rc(), channels: [{ id: "v1", kind: "voltage", a: 1, b: 0 }] });
  h.advance(1);
  const f0 = h.frames()[0];
  expect(f0.runState).toBe("paused");
  expect(f0.t1).toBe(0);
  expect(f0.display[1]).toBeCloseTo(5, 12);
  expect(f0.times.length).toBe(1);
  expect(h.posted.some((m) => m.type === "timeScales")).toBe(true);
  expect(h.posted.some((m) => m.type === "diagnostics")).toBe(true);

  // Nothing advances while paused.
  h.advance(500);
  expect(h.host.time).toBe(0);

  h.ack(f0.frame);
  h.host.handle({ type: "step" });
  h.advance(20);
  const f1 = h.frames().at(-1)!;
  expect(f1.t1).toBeGreaterThan(0);
  expect(f1.runState).toBe("paused");
  expect(f1.t0).toBe(0);
});

test("host runs at the requested speed and respects back-pressure", () => {
  const h = harness();
  h.host.handle({ type: "load", netlist: rc(), channels: [{ id: "vc", kind: "voltage", a: 2, b: 0 }] });
  h.host.handle({ type: "setSpeed", speed: 1e-3 }); // 1 ms of circuit per second
  h.host.handle({ type: "run" });
  h.advance(1000);
  expect(h.host.state).toBe("running");
  expect(h.host.time).toBeGreaterThan(0.9e-3);
  expect(h.host.time).toBeLessThan(1.1e-3);
  // No acks were sent, so at most two frames are in flight.
  expect(h.frames().length).toBe(2);
  // Acknowledging releases the merged frame, which carries every sample since.
  h.ack(2);
  h.advance(50);
  const fs = h.frames();
  expect(fs.length).toBeGreaterThanOrEqual(3);
  const all = fs.reduce((n, f) => n + f.times.length, 0);
  const times = fs.flatMap((f) => Array.from(f.times));
  for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
  expect(all).toBeGreaterThan(10);
  expect(fs[2].t0).toBe(fs[1].t1);
});

test("host pauses on a pause condition and reports stopped circuits", () => {
  const h = harness();
  h.host.handle({ type: "load", netlist: rc(), channels: [{ id: "vc", kind: "voltage", a: 2, b: 0 }] });
  h.host.handle({ type: "setPauseConditions", conditions: [{ id: "half", channel: "vc", op: "rises-above", level: 2.5 }] });
  h.host.handle({ type: "setSpeed", speed: 1e-2 });
  h.host.handle({ type: "run" });
  for (let i = 0; i < 20; i++) {
    h.advance(50);
    const last = h.frames().at(-1);
    if (last) h.ack(last.frame);
  }
  expect(h.host.state).toBe("paused");
  expect(h.host.time).toBeCloseTo(Math.log(2) * 1e-3, 6);
  expect(h.frames().some((f) => f.events.some((e) => e.kind === "pauseCondition"))).toBe(true);

  const bad = harness();
  bad.host.handle({
    type: "load",
    netlist: netlist(1, [
      ["V1", "vsource", [1, 0], { voltage: 1 }],
      ["V2", "vsource", [1, 0], { voltage: 2 }],
    ]),
    channels: [],
  });
  bad.advance(1);
  expect(bad.host.state).toBe("stopped");
  const diag = bad.posted.find((m) => m.type === "diagnostics");
  expect(diag && diag.type === "diagnostics" && diag.diagnostics[0].id).toBe("singular-matrix");
});
