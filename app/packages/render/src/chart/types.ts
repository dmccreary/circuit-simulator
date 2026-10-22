// Chart data model (rendering.md §5.2). Session state only; lanes and probes
// come from the document and are mapped to ChartLane by the app.

/** The part of the history store's TraceView the chart needs (history-and-analysis.md §2). */
export interface TraceSource {
  minMaxBuckets(t0: number, t1: number, buckets: number): { min: ArrayLike<number>; max: ArrayLike<number> };
  /** Linear interpolation; NaN outside the held data. */
  valueAt?(t: number): number;
  /** Raw samples inside the view's span. */
  times?(): ArrayLike<number>;
  values?(): ArrayLike<number>;
  readonly length?: number;
}

export interface HistorySource {
  view(channelId: string, t0: number, t1: number): TraceSource | undefined;
}

export interface ChartTrace {
  channelId: string;
  name: string;
  color: string;
  /** Unit of the trace's values ("V", "A", "W"); defaults to the lane's unit. */
  unit?: string;
  /** A kept copy of an earlier run (CHT-17): drawn faded and dashed with its label. */
  ghost?: boolean;
}

export interface ChartLane {
  id: string;
  /** Primary unit (left axis). */
  unit: string;
  traces: ChartTrace[];
  kind?: "analog" | "logic";
  /** Preferred height in CSS pixels; lanes share the panel in proportion (CHT-02). */
  height?: number;
  yScale?: { mode: "auto" | "fixed"; min?: number; max?: number };
}

export type ChartMode = "roll" | "sweep" | "triggered";

export interface TriggerSpec {
  channelId?: string;
  level: number;
  edge: "rising" | "falling";
  /** auto: free-runs after a window with no trigger; normal: holds the last sweep; single: one sweep. */
  sweep: "auto" | "normal" | "single";
  /** Fraction of the window shown before the trigger point. */
  pre: number;
}

export interface ChartModel {
  mode: ChartMode;
  span: number; // seconds (CHT-07)
  latest: number; // newest simulated time with data
  /** False after the student pans or zooms away from the newest data (CHT-21). */
  live: boolean;
  /** Window start while not live. */
  start: number;
  trigger: TriggerSpec;
  playhead?: number; // shown when paused (CHT-22)
  cursors?: { a: number; b: number }; // CHT-26
  hover?: { t: number; lane?: string }; // CHT-25
  /** Shown beside the playhead, e.g. "history not available" (CHT-23). */
  note?: string;
}

/** @deprecated alias kept for older callers. */
export type ChartState = ChartModel;

export type Formatter = (value: number, unit: string) => string;

export const defaultTrigger = (): TriggerSpec => ({ level: 0, edge: "rising", sweep: "auto", pre: 0.1 });

export const defaultChartModel = (): ChartModel => ({
  mode: "roll",
  span: 5,
  latest: 0,
  live: true,
  start: 0,
  trigger: defaultTrigger(),
});
