// Messages between the main thread and the analysis worker
// (history-and-analysis.md §5.1–5.2). Separate from the live worker's
// protocol: the analysis worker starts lazily and never touches the live run.

import type { AnalysisJob, AnalysisResult } from "@cs/engine";

export const ANALYSIS_PROTOCOL_VERSION = 1;

/** Main thread → analysis worker. */
export type AnalysisRequest =
  | { type: "submit"; jobId: number; job: AnalysisJob }
  | { type: "cancel"; jobId: number };

/** Analysis worker → main thread. */
export type AnalysisReply =
  | { type: "ready"; protocolVersion: number }
  | { type: "progress"; jobId: number; fraction: number; partial?: AnalysisResult }
  | { type: "result"; jobId: number; result: AnalysisResult }
  /** The job was cancelled; `partial` holds what was computed (ANL-20). */
  | { type: "cancelled"; jobId: number; partial?: AnalysisResult }
  | { type: "error"; jobId: number; message: string };
