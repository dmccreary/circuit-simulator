// Analysis settings saved in the document's `analyses` field (a cosmetic
// root: editing it never recompiles the circuit). Each tab owns one key.

import type { CircuitDocument } from "@cs/model";
import type { SweepMeasure, WindowShape } from "@cs/engine";

export type AnalysisTab = "dc" | "ac" | "dcSweep" | "paramSweep" | "spectrum";
export const ANALYSIS_TABS: AnalysisTab[] = ["dc", "ac", "dcSweep", "paramSweep", "spectrum"];

export interface AcSettings {
  /** Input source part id; default: the first AC source (ANL-08). */
  input?: string;
  start: number;
  stop: number;
  pointsPerDecade: number;
  scale: "log" | "linear";
  gain: "db" | "ratio";
}

export interface RangeSettings {
  element?: string;
  key?: string;
  start: number;
  stop: number;
  steps: number;
  scale: "linear" | "log";
  /** A list such as "1k, 2.2k, 4.7k"; used instead of the range when not empty (ANL-17). */
  list?: string;
}

export interface DcSweepSettings extends RangeSettings {
  outerElement?: string;
  outerKey?: string;
  /** Outer values as a list (ANL-19); empty for no outer parameter. */
  outerList?: string;
}

export interface ParamSweepSettings extends RangeSettings {
  kind: "transient" | "measurement";
  duration: number;
  measure: SweepMeasure;
}

export interface SpectrumSettings {
  probe?: string;
  window: WindowShape;
  axis: "linear" | "log";
  units: "db" | "rms";
  /** Which part of the trace: the chart's visible window, between cursors A and B, or all of it (ANL-22). */
  source: "visible" | "cursors" | "all";
}

export interface AnalysesDoc {
  tab?: AnalysisTab;
  ac?: Partial<AcSettings>;
  dcSweep?: Partial<DcSweepSettings>;
  paramSweep?: Partial<ParamSweepSettings>;
  spectrum?: Partial<SpectrumSettings>;
}

export const DEFAULTS = {
  ac: { start: 1, stop: 1e6, pointsPerDecade: 50, scale: "log", gain: "db" } as AcSettings,
  dcSweep: { start: 0, stop: 5, steps: 51, scale: "linear" } as DcSweepSettings,
  paramSweep: { start: 1000, stop: 10000, steps: 5, scale: "log", kind: "transient", duration: 0.01, measure: "final" } as ParamSweepSettings,
  spectrum: { window: "hann", axis: "linear", units: "db", source: "visible" } as SpectrumSettings,
};

type Key = keyof typeof DEFAULTS;
type SettingsOf<K extends Key> = (typeof DEFAULTS)[K];

export function analysesOf(doc: CircuitDocument): AnalysesDoc {
  return (doc.analyses ?? {}) as AnalysesDoc;
}

export function settingsOf<K extends Key>(doc: CircuitDocument, key: K): SettingsOf<K> {
  return { ...DEFAULTS[key], ...((analysesOf(doc)[key] as Partial<SettingsOf<K>>) ?? {}) } as SettingsOf<K>;
}

/** Merge a settings patch into a draft document. */
export function patchSettings<K extends Key>(draft: CircuitDocument, key: K, patch: Partial<SettingsOf<K>>): void {
  const a = (draft.analyses ??= {}) as AnalysesDoc;
  a[key] = { ...((a[key] as object) ?? {}), ...patch } as AnalysesDoc[K];
}
