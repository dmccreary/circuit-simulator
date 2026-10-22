// One entry point for every analysis job: a generator that yields progress
// (with partial results) between chunks of work and returns the result.

import type { FactoryLookup } from "../circuit";
import { acAnalysis } from "./ac";
import { dcTable } from "./dc-table";
import { spectrumAnalysis } from "./spectrum";
import { sweepAnalysis } from "./sweep";
import type { AnalysisJob, AnalysisProgress, AnalysisResult } from "./types";

// eslint-disable-next-line require-yield
function* dcAnalysis(job: Extract<AnalysisJob, { kind: "dc" }>, lookup: FactoryLookup): Generator<AnalysisProgress, AnalysisResult> {
  return dcTable(job.netlist, lookup);
}

export function runAnalysis(job: AnalysisJob, lookup: FactoryLookup): Generator<AnalysisProgress, AnalysisResult> {
  switch (job.kind) {
    case "dc":
      return dcAnalysis(job, lookup);
    case "ac":
      return acAnalysis(job, lookup);
    case "sweep":
      return sweepAnalysis(job, lookup);
    case "spectrum":
      return spectrumAnalysis(job);
  }
}

/** Run a job to completion synchronously (tests, small jobs). */
export function runAnalysisSync(job: AnalysisJob, lookup: FactoryLookup): AnalysisResult {
  const it = runAnalysis(job, lookup);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
