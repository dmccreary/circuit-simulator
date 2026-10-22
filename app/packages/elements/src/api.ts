// Shared contract: the element plug-in interface
// (design/circuit-model.md §5, design/simulation-engine.md §5).
// Descriptors and models must not touch the DOM. Views run on the main thread only.
// Changing this file affects every package; coordinate before editing.

import type { MessageRef, NetlistElement, NodeIndex, Part, Point, PropValue } from "@cs/model";

// ---------------------------------------------------------------- descriptor

export type Unit = "ohm" | "F" | "H" | "V" | "A" | "W" | "Hz" | "s" | "%" | "°C" | "";

export type CategoryId =
  | "basic"
  | "sources"
  | "passive"
  | "semiconductors"
  | "switches"
  | "outputs"
  | "meters"
  | "logic"
  | "wiring";

export interface TerminalSpec {
  name: string; // "+", "-", "A", "K"
  at: Point; // position in the symbol frame; terminal 0 is at (0,0)
}

export interface PropSpec {
  key: string;
  unit: Unit;
  kind?: "number" | "boolean" | "enum" | "text"; // default "number"
  options?: string[]; // for enums
  range?: [number, number];
  default: PropValue;
  realisticDefault?: PropValue;
  sliderable?: boolean;
  standardSeries?: boolean;
  showOnCanvas?: boolean;
}

export interface ReadoutSpec {
  key: string; // "voltage", "current", "power"
  unit: Unit;
}

export interface ElementDescriptor {
  type: string;
  category: CategoryId;
  essentials?: boolean;
  aliases: string[];
  hotkey?: string;
  labelPrefix: string; // "R"
  terminals: TerminalSpec[];
  /** Two-terminal parts whose second terminal sits at (length, 0). */
  stretchable?: { min: number; default: number };
  props: PropSpec[];
  readouts: ReadoutSpec[];
  /** Hints for the netlist compiler's structural checks. */
  traits?: {
    /** Terminal 0 joins this named net (the ground symbol uses "GND"). */
    netName?: string;
    voltageSource?: boolean;
    currentSource?: boolean;
    ammeter?: boolean;
    voltmeter?: boolean;
    /** Name of a boolean prop; when true, terminals 0 and 1 are shorted (closed switch). */
    shortWhenProp?: string;
  };
}

// ---------------------------------------------------------------- model (engine half)

/**
 * Unknown indexing: 0 = ground (never stamped), 1..nodeCount = node voltages,
 * nodeCount+1.. = extra branch currents allocated with allocBranch().
 */
export type UnknownIndex = number;

export interface SetupContext {
  /** Node index per terminal (0 = ground). */
  readonly nodes: readonly NodeIndex[];
  /** Allocate an extra unknown (branch current). Returns its UnknownIndex. */
  allocBranch(name: string): UnknownIndex;
}

export interface Stamper {
  /** Add to A[row][col]. Rows/cols equal to 0 (ground) are ignored. */
  matrix(row: UnknownIndex, col: UnknownIndex, value: number): void;
  /** Add to b[row]. Row 0 is ignored. */
  rhs(row: UnknownIndex, value: number): void;
  /** Conductance g between nodes a and b. */
  conductance(a: NodeIndex, b: NodeIndex, g: number): void;
  /** Independent current i flowing out of node a, through the element, into node b. */
  current(a: NodeIndex, b: NodeIndex, i: number): void;
  /**
   * Ideal voltage source: V(plus) - V(minus) = v. x[branch] is the current
   * flowing INTO the plus terminal from the circuit, through the source, and
   * out of the minus terminal (SPICE convention). Node rows are KCL with
   * "current leaving the node through elements" positive.
   */
  voltageSource(branch: UnknownIndex, plus: NodeIndex, minus: NodeIndex, v: number): void;
}

export interface StepInfo {
  kind: "transient" | "dc" | "ac";
  t: number; // time at the END of the step being solved
  dt: number; // step size (0 for dc)
  method: "be" | "trap"; // integration rule for companion models
  gmin: number;
  sourceScale: number; // 0..1, for DC source stepping; 1 normally
  omega?: number; // "ac" only
}

export interface SolutionView {
  /** Value of an unknown; 0 for ground. */
  x(i: UnknownIndex): number;
  /** Node voltage; same as x() for node indexes. */
  v(node: NodeIndex): number;
}

export interface ReadoutSink {
  add(key: string, value: number): void;
}

export interface StressReport {
  overLimit: boolean;
  temperature?: number;
  failMode?: "open" | "short";
}

export interface DigitalContext {
  readonly t: number;
  input(pin: number): "0" | "1" | "X" | "Z";
  schedule(pin: number, value: "0" | "1" | "X" | "Z", delay: number): void;
}

export interface ElementModel {
  /** Number of doubles written by saveState / read by loadState. */
  readonly stateSize: number;
  /** True if stampNewton is used (non-linear). */
  readonly nonlinear?: boolean;

  setup(ctx: SetupContext): void;
  /** Values changed live (SIM-18); called between steps. */
  setProps(props: Record<string, PropValue>): void;

  stampStatic?(s: Stamper): void;
  stampStep?(s: Stamper, step: StepInfo): void;
  stampNewton?(s: Stamper, x: SolutionView, step: StepInfo): void;
  hasConverged?(x: SolutionView, previous: SolutionView): boolean;

  /** A step was accepted; update internal state. */
  accept(x: SolutionView, step: StepInfo): void;
  /** Set initial state for t = 0 ("zero" start) from initial conditions. */
  initialize?(): void;

  truncationError?(x: SolutionView, step: StepInfo): number;
  breakpoints?(t0: number, t1: number, out: number[]): void;
  evaluateDigital?(ctx: DigitalContext): void;

  readouts(x: SolutionView, out: ReadoutSink): void;
  /** Current INTO each terminal, amps, in terminal order (out.length === terminal count). */
  terminalCurrents(x: SolutionView, out: Float64Array): void;
  stress?(x: SolutionView, step: StepInfo): StressReport | undefined;

  saveState(out: Float64Array): void;
  loadState(from: Float64Array): void;
}

export type ModelFactory = (el: NetlistElement) => ElementModel;

// ---------------------------------------------------------------- view (main thread)

export type ColorToken =
  | "symbol"
  | "symbol.selected"
  | "label"
  | "value"
  | "wire"
  | "terminal"
  | "glow"
  | "charge.plus"
  | "charge.minus"
  | "background";

export interface TextStyle {
  size?: number; // grid units; default 0.6
  align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "bottom";
  color?: ColorToken;
}

/** All coordinates in the part's local grid frame (terminal 0 at origin). */
export interface SymbolGraphics {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  closePath(): void;
  stroke(color?: ColorToken, width?: number): void;
  fill(color?: ColorToken, alpha?: number): void;
  text(s: string, x: number, y: number, style?: TextStyle): void;
}

export interface LiveReadouts {
  get(key: string): number | undefined;
  /** Voltage at each terminal. */
  terminalVoltages: readonly number[];
}

export interface ControlRegion {
  id: string; // "toggle", "wiper"
  shape: Box;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ElementView {
  drawSymbol(g: SymbolGraphics, part: Part, style: "ansi" | "iec" | "lifelike"): void;
  drawLive?(g: SymbolGraphics, part: Part, live: LiveReadouts): void;
  /**
   * Paths current takes through the part (local frame). Each path runs from
   * terminal `from` to terminal `to`; current along it is the current into `from`.
   */
  currentPaths(part: Part): { points: Point[]; from: number; to: number }[];
  controls?(part: Part): ControlRegion[];
  hitShape(part: Part): Box;
  describe(part: Part, live?: LiveReadouts): MessageRef;
}

// ---------------------------------------------------------------- registry

export interface ElementPlugin {
  descriptor: ElementDescriptor;
  model?: ModelFactory; // absent for pure-wiring parts (ground symbol, net label)
  view?: ElementView;
}
