// Shared contract: the circuit document (design/circuit-model.md §2).
// All geometry is in integer grid units. Values are SI numbers.
// Changing this file affects every package; coordinate before editing.

export type Id = string;
export type ElementId = string; // part id, or hierarchical "U1/R3" after flattening
export type NodeId = string; // display name of a node: "GND", "N1", a net label

export interface Point {
  x: number;
  y: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface Orientation {
  rot: Rotation; // clockwise, applied after flip
  flip: boolean; // mirror across the local x axis before rotating
}

export type PropValue = number | string | boolean;

/** A translation key plus values. Never English text (Overview §7.2). */
export interface MessageRef {
  key: string;
  values?: Record<string, string | number>;
}

export interface CircuitSettings {
  realisticParts: boolean;
  realisticRatings: boolean;
  start: "zero" | "steady";
  seed: number;
  maxTimeStep?: number; // SIM-08, seconds
  integration?: "trap" | "gear2";
}

export interface Part {
  id: Id;
  type: string; // "resistor", "falstad:placeholder"
  label: string; // "R1"
  at: Point; // grid position of the first terminal
  orientation: Orientation;
  length?: number; // stretchable two-terminal parts, grid units
  props: Record<string, PropValue>;
  labelOffset?: Point;
  locked?: boolean;
  savedState?: number[];
}

export interface Wire {
  id: Id;
  points: Point[]; // at least two; consecutive points form axis-aligned segments
}

export interface NetLabel {
  id: Id;
  name: string; // "GND" is ground
  at: Point;
}

export interface Annotation {
  id: Id;
  kind: "text" | "box";
  at: Point;
  text?: string;
  size?: Point;
}

export type ProbeTarget =
  | { kind: "point"; wire: Id; segment: number; t: number }
  | { kind: "terminal"; part: Id; terminal: number }
  | { kind: "across"; part: Id }
  | { kind: "between"; a: ProbeTarget; b: ProbeTarget }
  | { kind: "through"; part: Id; terminal?: number; reversed: boolean }
  | { kind: "segment"; wire: Id; segment: number; reversed: boolean };

export interface TraceStyle {
  color: string; // a palette token such as "probe.1"
  width: number;
  dash?: "solid" | "dashed" | "dotted";
  marker?: "none" | "circle" | "square";
}

export interface MeasurementSpec {
  kind: string; // "mean", "rms", "peakToPeak", "frequency", ...
}

export interface Probe {
  id: Id;
  name: string;
  quantity: "voltage" | "current" | "power" | "logic";
  target: ProbeTarget;
  style: TraceStyle;
  lane: Id;
  flag: { offset: Point; showValue: boolean };
  measurements: MeasurementSpec[];
}

export interface Lane {
  id: Id;
  kind: "analog" | "logic";
  height?: number;
  yScale?: { mode: "auto" | "fixed"; min?: number; max?: number };
}

export interface MathTrace {
  id: Id;
  name: string;
  expression: string;
  lane: Id;
  style: TraceStyle;
}

export interface Slider {
  id: Id;
  part: Id;
  prop: string;
  min: number;
  max: number;
  log?: boolean;
}

export interface SubcircuitDefinition {
  id: Id;
  name: string;
  parts: Record<Id, Part>;
  wires: Record<Id, Wire>;
  netLabels: Record<Id, NetLabel>;
  pins: { name: string; at: Point; side: "left" | "right" | "top" | "bottom" }[];
  sealed?: boolean;
  readOnly?: boolean;
}

export interface AnalysisSettings {
  [kind: string]: unknown;
}

export interface CircuitDocument {
  formatVersion: number;
  meta: { title: string; description: string };
  settings: CircuitSettings;
  parts: Record<Id, Part>;
  wires: Record<Id, Wire>;
  netLabels: Record<Id, NetLabel>;
  annotations: Record<Id, Annotation>;
  probes: Record<Id, Probe>;
  lanes: Lane[];
  mathTraces: Record<Id, MathTrace>;
  sliders: Record<Id, Slider>;
  subcircuits: Record<Id, SubcircuitDefinition>;
  analyses: AnalysisSettings;
  view: { center: Point; zoom: number };
}

export interface FixAction {
  label: MessageRef;
  /** A document edit; applied by the shell inside one transaction. */
  apply(draft: CircuitDocument): void;
}

export interface Diagnostic {
  id: string; // stable kind, such as "sources-in-parallel"
  severity: "info" | "warning" | "error";
  message: MessageRef;
  elements: ElementId[];
  nodes?: NodeId[];
  fixes?: FixAction[];
  simTime?: number;
}

// ---- Patches (design/circuit-model.md §3) ----

export type PatchPath = (string | number)[];

/** "set" writes value at path (creating it); "delete" removes the key or array index. */
export type Patch =
  | { op: "set"; path: PatchPath; value: unknown }
  | { op: "delete"; path: PatchPath };

export interface PatchBatch {
  patches: Patch[];
  /** true while the transaction is still open (live drag), false on commit/undo/redo. */
  provisional: boolean;
  source: "edit" | "undo" | "redo" | "cancel" | "load";
  label?: MessageRef;
}

export type Unsubscribe = () => void;
