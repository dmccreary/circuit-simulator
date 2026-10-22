import type { ChannelSpec, Diagnostic, ElementId, IdentityMap, Netlist, PropValue } from "@cs/model";
import type { SampleBlock } from "./channels";
import type { LinearSolver } from "./solver";
import type { TimeScales } from "./timescales";

/** Same shape as PauseCondition in @cs/worker's protocol (the engine cannot import the worker). */
export interface PauseCondition {
  id: string;
  channel: string;
  op: "rises-above" | "falls-below";
  level: number;
}

/** Same shape as SimEvent in @cs/worker's protocol. */
export interface EngineEvent {
  t: number;
  kind: "paramChanged" | "topologyChanged" | "partFailed" | "pauseCondition" | "reset" | "error";
  element?: ElementId;
  detail?: string;
}

export interface ParamChange {
  element: ElementId;
  param: string;
  value: PropValue;
}

export interface StepOutcome {
  ok: boolean;
  t: number;
  dt: number;
  /** The step ended on a breakpoint (source edge, scheduled action). */
  breakpoint: boolean;
  pause?: PauseCondition;
}

export interface EngineOptions {
  /** Steps kept in the full-state history ring (CHT-23). Default 20,000. */
  historySteps?: number;
  /** Memory cap for the ring, bytes. Default 64 MB. */
  historyBudgetBytes?: number;
  reltol?: number; // 1e-3
  vntol?: number; // 1e-6 V
  abstol?: number; // 1e-12 A, Newton current tolerance
  /** Absolute LTE tolerance for current-like (branch) elements, A. Default 1e-9. */
  lteCurrentTol?: number;
  /** Truncation-error safety factor, as SPICE's TRTOL. Default 7. */
  trtol?: number;
  maxNewtonIterations?: number; // 50 transient, twice that for DC
  /** Backward-Euler steps after a discontinuity. Default 2. */
  beSteps?: number;
  /** Step limit when the circuit has no time scale at all. Default 1 ms. */
  staticMaxStep?: number;
  /** Accepted steps between restart checkpoints. Default 256. */
  checkpointInterval?: number;
  solverFactory?: () => LinearSolver;
}

export interface Engine {
  readonly netlist: Netlist;
  /** Simulated time of the latest accepted solution, seconds. */
  readonly time: number;
  readonly status: "ok" | "stopped";
  readonly diagnostics: readonly Diagnostic[];
  /** Increments whenever `diagnostics` changes. */
  readonly diagnosticsVersion: number;
  readonly timeScales: TimeScales;
  /** Increments whenever `timeScales` is recomputed. */
  readonly timeScalesVersion: number;
  readonly displaySize: number;
  readonly channelIds: readonly string[];

  /** Take one accepted step (natural step size; never clamped by the caller, for determinism). */
  step(): StepOutcome;
  /** Latest display state (copy). */
  displayState(): Float64Array;
  /** Readouts for one element at the latest solution (hover cards). */
  readouts(element: ElementId): Record<string, number>;

  setChannels(channels: ChannelSpec[]): void;
  /** Samples of every accepted step since the last drain. */
  drainSamples(): SampleBlock;
  drainEvents(): EngineEvent[];
  setPauseConditions(conditions: PauseCondition[]): void;

  setParams(changes: ParamChange[]): void;
  replaceNetlist(netlist: Netlist, identity: IdentityMap): void;
  reset(start?: "zero" | "steady"): void;
  stateAt(t: number): Float32Array | null;
  /**
   * Logic state per node at the latest solution, one byte each (index = NodeIndex):
   * 0 low, 1 high, 2 X, 3 Z, 255 analog node with no digital pins.
   * Empty when the circuit has no logic parts.
   */
  logicStates(): Uint8Array;
  /** Rewind to the latest accepted step at or before t. False if no checkpoint covers t. */
  restartFrom(t: number): boolean;
}
