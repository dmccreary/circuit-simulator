export type * from "./types";
export { amount, compare, toleranceWidth } from "./amount";
export { validateLesson, findStep, STEP_TYPES, CHECK_KINDS, MAX_HINTS, type ValidationResult } from "./validate";
export { loadLesson, formatProblem, withLine, type LoadResult } from "./load";
export { findPart, findProbe, nodeOf, partValueFromDisplay, type LessonContext, type Reason } from "./context";
export { evaluateCheck, checkDeps, checkKind, readValue, checkPartRefs } from "./checks";
export { applyFault, pickFault, seedFrom, describeFault } from "./faults";
export { checkAgainstCircuit } from "./circuit-check";
export {
  LessonEngine,
  formatNumber,
  type EngineEvent,
  type EngineOptions,
  type LessonSummary,
  type PredictionSummary,
  type StepEffects,
  type SubmitResult,
} from "./engine";
export { emptyRecord, progressKey, restoreProgress, type Answer, type LessonProgress, type ProgressStore, type StepRecord } from "./progress";
export { parseMarkdownLite, parseInline, type Block, type Inline } from "./markdown";
export { stepSnapshotYaml } from "./author";
