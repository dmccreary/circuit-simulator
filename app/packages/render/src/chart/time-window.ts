// The visible time window: roll, sweep, panned, zoomed (CHT-07–09, CHT-21).

import { niceCeil } from "../axis";
import type { ChartModel } from "./types";

export interface TimeWindow {
  t0: number;
  t1: number;
}

export const MIN_SPAN = 1e-9;
export const MAX_SPAN = 1e6;

const clampSpan = (s: number) => Math.min(MAX_SPAN, Math.max(MIN_SPAN, s));

/** Roll and sweep windows; the triggered window comes from the TriggerTracker. */
export function liveWindow(mode: "roll" | "sweep", latest: number, span: number): TimeWindow {
  if (mode === "sweep") {
    const start = Math.floor(latest / span) * span;
    return { t0: start, t1: start + span };
  }
  return latest < span ? { t0: 0, t1: span } : { t0: latest - span, t1: latest };
}

/**
 * Zoom by `factor` (< 1 zooms in) keeping time `anchor` under the pointer.
 * A live roll window stays live and keeps its right edge on the newest data.
 */
export function zoomWindow(m: ChartModel, win: TimeWindow, anchor: number, factor: number): Partial<ChartModel> {
  const span = clampSpan((win.t1 - win.t0) * factor);
  if (m.live && m.mode !== "triggered") return { span };
  const frac = (anchor - win.t0) / (win.t1 - win.t0 || 1);
  return { span, live: false, start: anchor - frac * span };
}

/** Pan by `dt` seconds (positive moves toward later times); leaves live mode. */
export function panWindow(win: TimeWindow, dt: number): Partial<ChartModel> {
  return { live: false, start: win.t0 + dt, span: win.t1 - win.t0 };
}

/** The circuit's natural timing from the worker's timeScales message. */
export interface TimeScalesLike {
  fastest: number;
  dominant: number;
  sourcePeriods: number[];
  kind: "transient" | "periodic" | "static";
}

/**
 * "Fit to circuit": a few periods of the slowest source for periodic circuits,
 * about five time constants for transients; undefined when nothing is known.
 */
export function fitSpan(ts: TimeScalesLike | undefined): number | undefined {
  if (!ts) return undefined;
  const periods = ts.sourcePeriods.filter((p) => p > 0 && Number.isFinite(p));
  if (periods.length) return niceCeil(4 * Math.max(...periods));
  if (ts.dominant > 0 && Number.isFinite(ts.dominant)) return niceCeil(5 * ts.dominant);
  if (ts.fastest > 0 && Number.isFinite(ts.fastest)) return niceCeil(10 * ts.fastest);
  return undefined;
}
