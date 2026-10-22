// Runs analysis jobs one chunk at a time, yielding to the message loop
// between chunks so cancel requests are seen promptly. Scheduler and post
// are injected so the host runs in-process in tests.

import { runAnalysis, type AnalysisJob, type AnalysisProgress, type AnalysisResult, type FactoryLookup } from "@cs/engine";
import type { AnalysisReply, AnalysisRequest } from "./analysis-protocol";

export interface AnalysisHostDeps {
  post(msg: AnalysisReply): void;
  /** Run fn soon, after pending messages. */
  schedule(fn: () => void): void;
  getModelFactory: FactoryLookup;
}

interface Running {
  jobId: number;
  it: Generator<AnalysisProgress, AnalysisResult>;
  partial?: AnalysisResult;
  cancelled: boolean;
}

export class AnalysisHost {
  private queue: Running[] = [];
  private pumping = false;

  constructor(private readonly deps: AnalysisHostDeps) {}

  handle(msg: AnalysisRequest): void {
    if (msg.type === "submit") {
      this.queue.push({ jobId: msg.jobId, it: this.start(msg.job), cancelled: false });
      this.kick();
    } else if (msg.type === "cancel") {
      const r = this.queue.find((q) => q.jobId === msg.jobId);
      if (r) r.cancelled = true;
    }
  }

  private start(job: AnalysisJob): Generator<AnalysisProgress, AnalysisResult> {
    return runAnalysis(job, this.deps.getModelFactory);
  }

  private kick(): void {
    if (this.pumping) return;
    this.pumping = true;
    this.deps.schedule(() => this.pump());
  }

  /** Advance the oldest job by one chunk. */
  private pump(): void {
    this.pumping = false;
    const r = this.queue[0];
    if (!r) return;
    if (r.cancelled) {
      this.queue.shift();
      this.deps.post({ type: "cancelled", jobId: r.jobId, partial: r.partial });
    } else {
      try {
        const step = r.it.next();
        if (step.done) {
          this.queue.shift();
          this.deps.post({ type: "result", jobId: r.jobId, result: step.value });
        } else {
          r.partial = step.value.partial;
          this.deps.post({ type: "progress", jobId: r.jobId, fraction: step.value.fraction, partial: step.value.partial });
        }
      } catch (e) {
        this.queue.shift();
        this.deps.post({ type: "error", jobId: r.jobId, message: (e as Error)?.message ?? String(e) });
      }
    }
    if (this.queue.length > 0) this.kick();
  }
}
