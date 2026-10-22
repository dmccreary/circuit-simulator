// Main-thread side of the analysis worker (history-and-analysis.md §5.1–5.2):
// the worker starts on the first job and stops after a minute idle.

import type { AnalysisJob, AnalysisResult, ResultOf } from "@cs/engine";
import type { AnalysisReply, AnalysisRequest } from "@cs/worker";

export interface AnalysisPort {
  postMessage(msg: AnalysisRequest): void;
  onmessage: ((e: MessageEvent<AnalysisReply>) => void) | null;
  onerror?: ((e: ErrorEvent) => void) | null;
  terminate?(): void;
}

export type JobOutcome<R> =
  | { status: "done"; result: R }
  | { status: "cancelled"; partial?: R }
  | { status: "error"; message: string };

export interface JobHandle<R> {
  readonly id: number;
  /** Settles once: done, cancelled (with partial results, ANL-20) or error. */
  readonly result: Promise<JobOutcome<R>>;
  onProgress(fn: (fraction: number, partial?: R) => void): void;
  cancel(): void;
}

export interface AnalysisServiceOptions {
  /** Idle time before the worker is terminated, ms (Overview §4.3: one minute). */
  idleMs?: number;
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(t: unknown): void;
}

interface Pending {
  settle(o: JobOutcome<AnalysisResult>): void;
  progress: ((f: number, p?: AnalysisResult) => void)[];
}

export const ANALYSIS_IDLE_MS = 60_000;

export class AnalysisService {
  private port: AnalysisPort | undefined;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private idleTimer: unknown;
  private readonly idleMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (t: unknown) => void;

  constructor(
    private readonly createPort: () => AnalysisPort | undefined,
    opts: AnalysisServiceOptions = {},
  ) {
    this.idleMs = opts.idleMs ?? ANALYSIS_IDLE_MS;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  }

  /** True while a worker is alive (started and not yet idle-terminated). */
  get running(): boolean {
    return this.port !== undefined;
  }

  submit<J extends AnalysisJob>(job: J): JobHandle<ResultOf<J>> {
    const id = this.nextId++;
    this.cancelIdle();
    let settle!: (o: JobOutcome<AnalysisResult>) => void;
    const result = new Promise<JobOutcome<AnalysisResult>>((resolve) => (settle = resolve));
    const entry: Pending = { settle, progress: [] };
    this.pending.set(id, entry);
    const port = this.ensurePort();
    if (!port) this.finish(id, { status: "error", message: "The analysis worker could not start." });
    else port.postMessage({ type: "submit", jobId: id, job });
    return {
      id,
      result: result as Promise<JobOutcome<ResultOf<J>>>,
      onProgress: (fn) => entry.progress.push(fn as (f: number, p?: AnalysisResult) => void),
      cancel: () => {
        if (this.pending.has(id)) this.port?.postMessage({ type: "cancel", jobId: id });
      },
    };
  }

  dispose(): void {
    for (const id of [...this.pending.keys()]) this.finish(id, { status: "cancelled" });
    this.cancelIdle();
    this.stopWorker();
  }

  private ensurePort(): AnalysisPort | undefined {
    if (this.port) return this.port;
    const port = this.createPort();
    if (!port) return undefined;
    port.onmessage = (e) => this.onMessage(e.data);
    port.onerror = (e) => {
      for (const id of [...this.pending.keys()]) this.finish(id, { status: "error", message: e.message || "Analysis worker error" });
      this.stopWorker();
    };
    this.port = port;
    return port;
  }

  private onMessage(m: AnalysisReply): void {
    if (m.type === "ready") return;
    const p = this.pending.get(m.jobId);
    if (!p) return;
    switch (m.type) {
      case "progress":
        p.progress.forEach((fn) => fn(m.fraction, m.partial));
        break;
      case "result":
        this.finish(m.jobId, { status: "done", result: m.result });
        break;
      case "cancelled":
        this.finish(m.jobId, { status: "cancelled", partial: m.partial });
        break;
      case "error":
        this.finish(m.jobId, { status: "error", message: m.message });
        break;
    }
  }

  private finish(id: number, o: JobOutcome<AnalysisResult>): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    p.settle(o);
    if (this.pending.size === 0) this.armIdle();
  }

  private armIdle(): void {
    this.cancelIdle();
    if (!this.port) return;
    this.idleTimer = this.setTimer(() => {
      this.idleTimer = undefined;
      if (this.pending.size === 0) this.stopWorker();
    }, this.idleMs);
  }

  private cancelIdle(): void {
    if (this.idleTimer !== undefined) this.clearTimer(this.idleTimer);
    this.idleTimer = undefined;
  }

  private stopWorker(): void {
    const p = this.port;
    this.port = undefined;
    if (p) {
      p.onmessage = null;
      p.terminate?.();
    }
  }
}

/** The real worker, created lazily by the service. */
export function createAnalysisWorker(): AnalysisPort | undefined {
  try {
    return new Worker(new URL("../../../worker/src/analysis-worker.ts", import.meta.url), { type: "module" }) as unknown as AnalysisPort;
  } catch {
    return undefined;
  }
}
