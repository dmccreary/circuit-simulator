// Analysis service core (history-and-analysis.md §5): pure, Node-testable.
export type * from "./types";
export { runAnalysis, runAnalysisSync } from "./run";
export { operatingPoint, solveDc, type OperatingPoint } from "./dc-op";
export { dcTable } from "./dc-table";
export { acAnalysis, frequencyGrid, stimulusNetlist, toBode, stampElementAC } from "./ac";
export { sweepAnalysis, sweepValues, measure, transientRun, evaluateChannels, MAX_TRACE_POINTS } from "./sweep";
export { spectrum, fft, windowValues, resample } from "./spectrum";
export { withProps, type PropOverride } from "./netlist-edit";
export { solveComplex, solveReal, AnalysisSingularError } from "./lu";
