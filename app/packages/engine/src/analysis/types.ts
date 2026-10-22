// Analysis jobs and results (history-and-analysis.md §5.2). Plain data, so
// jobs and results cross the worker boundary by structured clone.

import type { ChannelSpec, ElementId, Netlist } from "@cs/model";

/** A numeric property of one part, such as R1's "resistance". */
export interface ParamRef {
  element: ElementId;
  key: string;
}

/** Frequency grid for a frequency response (ANL-09). */
export interface FreqRange {
  start: number;
  stop: number;
  /** Points per decade on a log axis (default 50). */
  pointsPerDecade?: number;
  /** "linear" spaces `points` evenly instead. */
  scale?: "log" | "linear";
  points?: number;
}

export type WindowShape = "hann" | "rect" | "flattop";

/** What a measurement-versus-parameter sweep extracts from each run. */
export type SweepMeasure = "final" | "max" | "min" | "peakToPeak" | "average" | "rms";

export type AnalysisJob =
  | { kind: "dc"; netlist: Netlist }
  | { kind: "ac"; netlist: Netlist; input?: ElementId; outputs: ChannelSpec[]; freqs: FreqRange }
  | {
      kind: "sweep";
      netlist: Netlist;
      sweep: "transient" | "measurement" | "dc";
      param: ParamRef;
      values: number[];
      outputs: ChannelSpec[];
      /** Second, outer parameter for DC sweeps (ANL-19). */
      outer?: { param: ParamRef; values: number[] };
      /** Simulated time per run (transient and measurement sweeps). */
      duration?: number;
      measure?: SweepMeasure;
    }
  | { kind: "spectrum"; times: number[]; values: number[]; window?: WindowShape; t0?: number; t1?: number };

export interface DcNodeRow {
  index: number;
  name: string;
  voltage: number;
}

export interface DcPartRow {
  id: ElementId;
  type: string;
  /** Voltage across terminals 0 and 1 (or the part's own "voltage" readout). */
  voltage: number;
  /** Current into terminal 0. */
  current: number;
  /** Absorbed power (negative for a source delivering power). */
  power: number;
  readouts: Record<string, number>;
}

export interface DcResult {
  kind: "dc";
  ok: boolean;
  error?: string;
  nodes: DcNodeRow[];
  parts: DcPartRow[];
  /** Total power delivered by parts with negative absorbed power, and absorbed by the rest (W). */
  powerDelivered: number;
  /** Includes powerLeakage, so delivered and absorbed balance. */
  powerAbsorbed: number;
  /**
   * Power taken by the solver's gmin shunt from every node to ground (W): the
   * "solver leakage" that keeps an open circuit solvable. Tiny, but without
   * it the balance would show sources delivering picowatts no part absorbs.
   */
  powerLeakage?: number;
  /** Display state at the operating point (node voltages then terminal currents). */
  display: number[];
}

export interface AcOutput {
  id: string;
  re: number[];
  im: number[];
}

export interface AcResult {
  kind: "ac";
  ok: boolean;
  error?: string;
  freqs: number[];
  outputs: AcOutput[];
  /** The circuit has non-linear parts: the result is small-signal around the DC point (ANL-15). */
  nonlinear: boolean;
  /** Element types stamped by the generic fallback (no stampAC). */
  approximated: string[];
}

/** One curve family member: x values and one y array per output id. */
export interface SweepSeries {
  /** Parameter value of this run (transient), outer value (DC), or undefined (measurement). */
  value?: number;
  x: number[];
  y: Record<string, number[]>;
}

export interface SweepResult {
  kind: "sweep";
  sweep: "transient" | "measurement" | "dc";
  param: ParamRef;
  values: number[];
  series: SweepSeries[];
  /** Values whose run failed (no convergence). */
  failed: number[];
}

export interface Harmonic {
  n: number;
  freq: number;
  amplitude: number;
}

export interface SpectrumResult {
  kind: "spectrum";
  freqs: number[];
  /** Peak amplitude of each bin's sine component (DC bin: the mean). */
  amplitude: number[];
  /** Bin spacing, Hz (ANL-25). */
  resolution: number;
  sampleCount: number;
  window: WindowShape;
  fundamental?: Harmonic;
  harmonics: Harmonic[];
  /** Total harmonic distortion as a fraction (0.05 = 5%). */
  thd?: number;
}

export type AnalysisResult = DcResult | AcResult | SweepResult | SpectrumResult;

export type ResultOf<J extends AnalysisJob> = J extends { kind: "dc" }
  ? DcResult
  : J extends { kind: "ac" }
    ? AcResult
    : J extends { kind: "sweep" }
      ? SweepResult
      : SpectrumResult;

/** What a running job yields between chunks of work. */
export interface AnalysisProgress {
  fraction: number;
  partial?: AnalysisResult;
}
