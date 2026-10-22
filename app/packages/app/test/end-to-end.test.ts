import { getModelFactory } from "@cs/elements/models";
import { EngineHost, type Command, type WorkerMessage } from "@cs/worker";
import { AppController } from "../src/controller";
import { rcChargingCircuit } from "../src/demo-circuit";
import type { WorkerPort } from "../src/sim/sim-client";

/** Runs the real EngineHost in-process on a virtual clock, wired to the real AppController. */
function inProcessWorker() {
  let now = 0;
  const tasks: { at: number; fn: () => void }[] = [];
  const schedule = (fn: () => void, delayMs: number) => tasks.push({ at: now + Math.max(0, delayMs), fn });
  let port!: WorkerPort;
  const host = new EngineHost({
    now: () => now,
    schedule,
    post: (msg: WorkerMessage) => schedule(() => port.onmessage?.({ data: msg } as MessageEvent<WorkerMessage>), 0),
    getModelFactory,
  });
  port = {
    postMessage: (cmd: Command) => schedule(() => host.handle(structuredClone(cmd)), 0),
    onmessage: null,
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (let guard = 0; guard < 1e6; guard++) {
      tasks.sort((a, b) => a.at - b.at);
      const t = tasks[0];
      if (!t || t.at > end) break;
      tasks.shift();
      now = Math.max(now, t.at);
      t.fn();
    }
    now = end;
  };
  return { port, advance };
}

test("RC demo: loads paused, charges after closing S1 and running (τ = 1 s)", () => {
  const w = inProcessWorker();
  const c = new AppController(rcChargingCircuit(), { worker: w.port });
  w.advance(100);
  expect(c.store.get().runState).not.toBe("running");
  const t0 = c.bus.latest?.t1 ?? 0;
  expect(t0).toBe(0); // paused at t = 0

  c.edits.edit({ key: "edit.toggle" }, (d) => {
    d.parts.S1.props.closed = true;
  });
  c.commands.run("sim.runPause");
  w.advance(3000);
  c.commands.run("sim.runPause");
  w.advance(100);

  const f = c.bus.latest!;
  expect(f.t1).toBeGreaterThan(2);
  const v = c.bus.lastValue(c.channelId("P1"))!;
  const expected = 10 * (1 - Math.exp(-f.t1));
  expect(v).toBeCloseTo(expected, 1);
  // The history store got the whole trace.
  const view = c.history.view(c.channelId("P1"), 0, f.t1);
  const mm = view.minMaxBuckets(0, f.t1, 10);
  expect(Math.abs(mm.max[9])).toBeGreaterThan(Math.abs(mm.max[0]));
  c.dispose();
});
