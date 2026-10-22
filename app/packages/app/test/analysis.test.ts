// Analyses panel plumbing: the lazily started, idle-stopped worker service,
// the session's jobs and cache, the command, and settings saved as edits.
import { getModelFactory } from "@cs/elements/models";
import { AnalysisHost, type AnalysisReply, type AnalysisRequest, type WorkerMessage } from "@cs/worker";
import type { DcResult, AcResult } from "@cs/engine";
import { AppController } from "../src/controller";
import { rcChargingCircuit } from "../src/demo-circuit";
import { AnalysisService, type AnalysisPort } from "../src/analysis/service";
import { analysisOf, installAnalysisSession, parseList, rangeValues } from "../src/analysis/session";
import { settingsOf } from "../src/analysis/settings";
import { bodeMarkers, bodePoints } from "../src/analysis/markers";
import type { WorkerPort } from "../src/sim/sim-client";

/** An in-process analysis worker; `flush` runs queued work until idle. */
function fakeAnalysisWorkers() {
  const tasks: (() => void)[] = [];
  const ports: (AnalysisPort & { terminated: boolean })[] = [];
  const create = () => {
    const port: AnalysisPort & { terminated: boolean } = {
      terminated: false,
      onmessage: null,
      postMessage: (m: AnalysisRequest) => tasks.push(() => host.handle(structuredClone(m))),
      terminate() {
        this.terminated = true;
      },
    };
    const host = new AnalysisHost({
      post: (m: AnalysisReply) => tasks.push(() => port.onmessage?.({ data: structuredClone(m) } as MessageEvent<AnalysisReply>)),
      schedule: (fn) => tasks.push(fn),
      getModelFactory,
    });
    ports.push(port);
    return port;
  };
  const flush = async () => {
    for (let i = 0; i < 1e5 && tasks.length; i++) {
      tasks.shift()!();
      if (tasks.length === 0) await Promise.resolve();
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  return { create, flush, ports };
}

const noWorker: WorkerPort = { postMessage: () => {}, onmessage: null as ((e: MessageEvent<WorkerMessage>) => void) | null };

describe("AnalysisService", () => {
  test("starts the worker on first job and stops it after a minute idle", async () => {
    const w = fakeAnalysisWorkers();
    const timers: { fn: () => void; ms: number }[] = [];
    const svc = new AnalysisService(w.create, { setTimer: (fn, ms) => timers.push({ fn, ms }), clearTimer: () => {} });
    expect(svc.running).toBe(false);
    const h = svc.submit({ kind: "spectrum", times: [0, 1, 2, 3], values: [0, 1, 0, -1] });
    expect(svc.running).toBe(true);
    await w.flush();
    const o = await h.result;
    expect(o.status).toBe("done");
    expect(timers.at(-1)!.ms).toBe(60_000);
    timers.at(-1)!.fn();
    expect(svc.running).toBe(false);
    expect(w.ports[0].terminated).toBe(true);
    // A new job starts a fresh worker.
    svc.submit({ kind: "spectrum", times: [0, 1], values: [0, 1] });
    expect(w.ports).toHaveLength(2);
  });
});

describe("analysis session", () => {
  function setup() {
    const c = new AppController(rcChargingCircuit(), { worker: noWorker });
    const w = fakeAnalysisWorkers();
    const s = installAnalysisSession(c, w.create);
    return { c, s, w };
  }

  test("analysis.open opens the panel and computes the DC tables", async () => {
    const { c, s, w } = setup();
    expect(c.commands.run("analysis.open")).toBe(true);
    expect(s.ui.get().open).toBe(true);
    expect(analysisOf(c)).toBe(s);
    await w.flush();
    const st = s.ui.get().tabs.dc;
    expect(st.status).toBe("done");
    const r = st.result as DcResult;
    expect(r.ok).toBe(true);
    // S1 is open: no current flows, C1 sits at 0 V and the battery node at 10 V.
    expect(Math.max(...r.nodes.map((n) => n.voltage))).toBeCloseTo(10, 6);
    // Cached: reopening the same tab does not resubmit.
    const before = w.ports.length;
    s.setTab("dc");
    await w.flush();
    expect(w.ports.length).toBe(before);
    c.dispose();
  });

  test("Frequency tab: battery as input, probe as output; settings are saved in the document", async () => {
    const { c, s, w } = setup();
    c.edits.edit({ key: "edit" }, (d) => {
      d.parts.S1.props.closed = true;
    });
    s.open("ac");
    await w.flush();
    const r = s.ui.get().tabs.ac.result as AcResult;
    expect(r.ok).toBe(true);
    expect(r.outputs[0].id).toBe("P1");
    // RC = 1 s: −3 dB near 0.159 Hz, so 1 Hz is well past it.
    const pts = bodePoints(r.freqs, r.outputs[0].re, r.outputs[0].im);
    expect(pts[0].db).toBeLessThan(-15);

    c.edits.edit({ key: "analysis.settings" }, (d) => {
      (d.analyses as Record<string, unknown>).ac = { start: 0.01, stop: 100, pointsPerDecade: 20 };
    });
    expect(settingsOf(c.edits.doc, "ac")).toMatchObject({ start: 0.01, stop: 100, pointsPerDecade: 20, scale: "log" });
    s.run("ac");
    await w.flush();
    const r2 = s.ui.get().tabs.ac.result as AcResult;
    expect(r2.freqs).toHaveLength(81);
    expect(s.ui.get().tabs.ac.ghost).toBe(r);
    const m = bodeMarkers(bodePoints(r2.freqs, r2.outputs[0].re, r2.outputs[0].im));
    const cutoff = m.find((k) => k.kind === "cutoff")!;
    expect(cutoff.freq).toBeCloseTo(1 / (2 * Math.PI), 2);
    expect(m.find((k) => k.kind === "phase" && k.value === -45)!.freq).toBeCloseTo(1 / (2 * Math.PI), 2);
    c.dispose();
  });

  test("sweeps without a chosen parameter explain what is missing", () => {
    const { c, s } = setup();
    s.run("dcSweep");
    expect(s.ui.get().tabs.dcSweep).toMatchObject({ status: "error", error: "analysis.needParam" });
    c.dispose();
  });

  test("value lists and ranges", () => {
    expect(parseList("1k, 2.2k 4.7k;10k")).toEqual([1000, 2200, 4700, 10000]);
    expect(rangeValues({ start: 1, stop: 100, steps: 3, scale: "log" })).toEqual([1, expect.closeTo(10, 9), expect.closeTo(100, 9)]);
    expect(rangeValues({ start: 0, stop: 1, steps: 3, scale: "linear", list: "5, 6" })).toEqual([5, 6]);
  });
});
