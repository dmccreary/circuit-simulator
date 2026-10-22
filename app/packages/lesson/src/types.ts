// The lesson file, after validation (embedding-lessons-xapi.md §4.1).
// Every field is data from a closed vocabulary: a lesson cannot run code (LES-02).

/** A comparison target: a number, or text with units such as "2.5 V" or "10k". */
export type Amount = number | string;

/** A tolerance: absolute ("0.05 V", 0.05) or relative ("2%"). */
export type Tolerance = Amount;

export type Quantity = "voltage" | "current" | "power";

/** Something that has a value at the latest frame. */
export type ValueRef = { part: string; quantity: Quantity } | { probe: string };

/** Comparison fields shared by value-like checks. */
export interface Compare {
  equals?: Amount;
  tolerance?: Tolerance;
  above?: Amount;
  below?: Amount;
  /** Inclusive [min, max]. */
  within?: [Amount, Amount];
}

export type Check =
  | { all: Check[] }
  | { any: Check[] }
  | { not: Check }
  | { part: { type?: string; label?: string; exists?: boolean } }
  | { property: { part: string; prop: string } & Compare }
  | { switch: { part: string; closed: boolean } }
  /** Terminal refs are "R1.1" (1-based) or a node name such as "GND". */
  | { connected: { a: string; b: string; connected?: boolean } }
  | { probe: { quantity?: Quantity | "logic"; part?: string; exists?: boolean } }
  | { value: { of: ValueRef } & Compare }
  /** A chart measurement (mean, rms, frequency, ...) over the last `over` seconds of a probe's trace. */
  | { measurement: { probe: string; kind: string; over?: Amount } & Compare }
  | { diagnostic: { id: string; present?: boolean } }
  /** The simulation has reached at least this simulated time. */
  | { "sim-time": Amount }
  | { "run-state": "running" | "paused" };

export type CheckKind =
  | "all"
  | "any"
  | "not"
  | "part"
  | "property"
  | "switch"
  | "connected"
  | "probe"
  | "value"
  | "measurement"
  | "diagnostic"
  | "sim-time"
  | "run-state";

export type BlindItem = "readouts" | "traces" | "animation";

/** Targeted feedback (LES-11): shown while its condition holds and the step is not complete. */
export type Feedback = { diagnostic: string; say: string } | { when: Check; say: string };

export type PanelName = "palette" | "chart" | "inspector" | "status" | "topbar";
export type ToolName = "select" | "wire" | "probe-v" | "place";

/** Lesson- or step-level permissions (LES-01). Unset fields inherit. */
export interface Permissions {
  edit?: "full" | "values" | "none";
  /** Part types offered in the palette, or "all". */
  palette?: string[] | "all";
  tools?: ToolName[];
  /** Part labels that cannot be moved, deleted or edited, or "all". */
  locked?: string[] | "all";
  panels?: PanelName[];
}

export interface Fault {
  part: string;
  kind: "open" | "short" | "value";
  /** For kind "value": the props to override, such as { resistance: "100k" }. */
  props?: Record<string, Amount | boolean>;
}

export type StepType = "read" | "predict-number" | "predict-choice" | "do" | "observe" | "measure" | "explain" | "troubleshoot";

interface StepBase {
  /** Optional stable name; steps are otherwise referred to by 1-based number. */
  id?: string;
  title?: string;
  /** Markdown-lite text shown above the step's controls. */
  text: string;
  /** Part labels, or "command:<id>" / "palette:<type>" for controls (LES-09). */
  spotlight: string[];
  /** Up to three, revealed one at a time (LES-10). */
  hints: string[];
  feedback: Feedback[];
  permissions?: Permissions;
  /** Shown when the step completes (LES-08). */
  success?: string;
}

export interface ReadStep extends StepBase {
  type: "read";
}
export interface PredictNumberStep extends StepBase {
  type: "predict-number";
  unit?: string;
  blind: BlindItem[];
  /** The simulation cannot run until the prediction is submitted (LES-03). Default true. */
  lockRun: boolean;
}
export interface PredictChoiceStep extends StepBase {
  type: "predict-choice";
  options: string[];
  /** Index of the correct option, if any; shown beside the choice later (LES-04). */
  answer?: number;
  blind: BlindItem[];
  lockRun: boolean;
}
export interface DoStep extends StepBase {
  type: "do";
  check: Check;
}
export interface ObserveStep extends StepBase {
  type: "observe";
  /** Completes once simulated time reaches this (seconds). */
  runFor: number;
  /** Step number (1-based) or id whose prediction is shown beside the result (LES-04). */
  compareWith?: string | number;
  /** The value to show beside the prediction. */
  show?: ValueRef;
  unit?: string;
}
export interface MeasureStep extends StepBase {
  type: "measure";
  value: ValueRef;
  unit?: string;
  tolerance: Tolerance;
}
export interface ExplainStep extends StepBase {
  type: "explain";
  options?: string[];
  /** Whether typed text may be sent in xAPI statements (XAP-05). Default false. */
  reportText: boolean;
}
export interface TroubleshootStep extends StepBase {
  type: "troubleshoot";
  faults: Fault[];
}

export type Step = ReadStep | PredictNumberStep | PredictChoiceStep | DoStep | ObserveStep | MeasureStep | ExplainStep | TroubleshootStep;

/** Where the starting circuit comes from. */
export type CircuitSource = { url: string } | { example: string } | { inline: unknown };

export interface Lesson {
  id: string;
  title: string;
  time?: string;
  objectives: string[];
  concepts: string[];
  circuit?: CircuitSource;
  permissions: Permissions;
  steps: Step[];
  /** Shown on the completion summary (LES-14). */
  summary?: string;
}

/** One problem in a lesson file (LES-16). */
export interface LessonProblem {
  message: string;
  /** Path into the YAML, such as ["steps", 2, "check"]. */
  path: (string | number)[];
  line?: number;
  column?: number;
  severity: "error" | "warning";
}
