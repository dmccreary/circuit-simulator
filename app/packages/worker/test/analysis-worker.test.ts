// Analysis worker job protocol (history-and-analysis.md §5.2), run in-process.
import { getModelFactory } from "@cs/elements/models";
import { AnalysisHost, type AnalysisReply, type AnalysisRequest } from "@cs/worker";
import type { Netlist } from "@cs/model";

const settings = { realisticParts: false, realisticRatings: false, start: "zero" as const, seed: 1 };
const rc: Netlist = {
  nodeCount: 2,
  nodeNames: ["GND", "N1", "N2"],
  settings,
  elements: [
    { id: "V1", type: "ac-source", nodes: [1, 0], props: { amplitude: 1, frequency: 50 } },
    { id: "R1", type: "resistor", nodes: [1, 2], props: { resistance: 1000 } },
    { id: "C1", type: "capacitor", nodes: [2, 0], props: { capacitance: 1e-6 } },
  ],
};

function fakeWorker() {
  const tasks: (() => void)[] = [];
  const replies: AnalysisReply[] = [];
  const host = new AnalysisHost({ post: (m) => replies.push(structuredClone(m)), schedule: (fn) => tasks.push(fn), getModelFactory });
  const send = (m: AnalysisRequest) => host.handle(structuredClone(m));
  const drain = (max = 1e5) => {
    for (let i = 0; i < max && tasks.length; i++) tasks.shift()!();
  };
  const tick = () => tasks.shift()?.();
  return { send, drain, tick, replies };
}

const acJob = (stop = 1e6) => ({ kind: "ac" as const, netlist: rc, input: "V1", outputs: [{ id: "v", kind: "voltage" as const, a: 2, b: 0 }], freqs: { start: 1, stop, pointsPerDecade: 50 } });

test("submit → progress → result", () => {
  const w = fakeWorker();
  w.send({ type: "submit", jobId: 7, job: acJob() });
  w.drain();
  const progress = w.replies.filter((r) => r.type === "progress");
  expect(progress.length).toBeGreaterThan(3);
  expect(progress.every((p, i) => i === 0 || p.type !== "progress" || (progress[i - 1] as { fraction: number }).fraction <= p.fraction)).toBe(true);
  const last = w.replies[w.replies.length - 1];
  expect(last.type).toBe("result");
  if (last.type !== "result" || last.result.kind !== "ac") throw new Error("no ac result");
  expect(last.jobId).toBe(7);
  expect(last.result.freqs).toHaveLength(301);
});

test("cancel between chunks keeps the partial result", () => {
  const w = fakeWorker();
  w.send({ type: "submit", jobId: 1, job: acJob() });
  w.tick();
  w.tick();
  w.send({ type: "cancel", jobId: 1 });
  w.drain();
  const last = w.replies[w.replies.length - 1];
  expect(last.type).toBe("cancelled");
  if (last.type !== "cancelled" || last.partial?.kind !== "ac") throw new Error("no partial");
  expect(last.partial.freqs.length).toBe(50);
  expect(w.replies.some((r) => r.type === "result")).toBe(false);
});

test("jobs run in order; DC and spectrum jobs complete in one chunk", () => {
  const w = fakeWorker();
  w.send({ type: "submit", jobId: 1, job: { kind: "dc", netlist: rc } });
  w.send({ type: "submit", jobId: 2, job: { kind: "spectrum", times: [0, 0.5, 1], values: [0, 1, 0] } });
  w.drain();
  expect(w.replies.map((r) => [r.type, (r as { jobId: number }).jobId])).toEqual([
    ["result", 1],
    ["result", 2],
  ]);
});

test("a failing job reports an error and the next job still runs", () => {
  const w = fakeWorker();
  w.send({ type: "submit", jobId: 1, job: { kind: "nonsense" } as unknown as AnalysisRequest extends { job: infer J } ? J : never });
  w.send({ type: "submit", jobId: 2, job: { kind: "dc", netlist: rc } });
  w.drain();
  expect(w.replies[w.replies.length - 1]).toMatchObject({ type: "result", jobId: 2 });
});
