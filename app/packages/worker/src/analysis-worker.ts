// Entry point of the analysis worker (history-and-analysis.md §5.1).
// Create with: new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" })

import { getModelFactory, loadAllModels } from "@cs/elements/models";
import { AnalysisHost } from "./analysis-host";
import { ANALYSIS_PROTOCOL_VERSION, type AnalysisReply, type AnalysisRequest } from "./analysis-protocol";

interface WorkerScope {
  postMessage(msg: AnalysisReply): void;
  onmessage: ((ev: MessageEvent<AnalysisRequest>) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;

// setTimeout(0) lets queued cancel messages run between chunks.
const host = new AnalysisHost({
  post: (msg) => scope.postMessage(msg),
  schedule: (fn) => setTimeout(fn, 0),
  getModelFactory,
});

// Part model groups load on demand (circuit-model.md §5.4); this worker is
// itself loaded on demand, so it simply loads them all before the first job.
const models = loadAllModels().catch((e: unknown) => console.error("Could not load part models", e));
scope.onmessage = (ev) => void models.then(() => host.handle(ev.data));
scope.postMessage({ type: "ready", protocolVersion: ANALYSIS_PROTOCOL_VERSION });
