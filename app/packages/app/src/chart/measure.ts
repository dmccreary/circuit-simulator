// Live measurements for the measurements panel (CHT-30), computed over the
// chart's visible window with the shared measurement library.

import { MEASUREMENTS, type HistoryStore, type MeasureResult } from "@cs/history";

/** Measurement kinds offered in the panel, in menu order, with the unit of each result. */
export const MEASUREMENT_KINDS: { kind: string; label: string; unit: (probeUnit: string) => string }[] = [
  { kind: "mean", label: "Mean", unit: (u) => u },
  { kind: "rms", label: "RMS", unit: (u) => u },
  { kind: "peakToPeak", label: "Peak-to-peak", unit: (u) => u },
  { kind: "min", label: "Minimum", unit: (u) => u },
  { kind: "max", label: "Maximum", unit: (u) => u },
  { kind: "frequency", label: "Frequency", unit: () => "Hz" },
  { kind: "period", label: "Period", unit: () => "s" },
  { kind: "dutyCycle", label: "Duty cycle", unit: () => "%" },
  { kind: "riseTime", label: "Rise time", unit: () => "s" },
  { kind: "fallTime", label: "Fall time", unit: () => "s" },
];

export const measurementInfo = (kind: string) => MEASUREMENT_KINDS.find((m) => m.kind === kind);

/** Above this many samples the window is decimated before measuring, to keep the panel cheap. */
const MAX_SAMPLES = 50_000;

export function measureWindow(
  history: Pick<HistoryStore, "view">,
  channelId: string,
  t0: number,
  t1: number,
  kinds: readonly string[],
): Record<string, MeasureResult> {
  const out: Record<string, MeasureResult> = {};
  let times: Float64Array;
  let values: Float64Array;
  try {
    const v = history.view(channelId, t0, t1);
    times = v.times();
    values = v.values();
  } catch {
    for (const k of kinds) out[k] = { ok: false, reason: { key: "measure.noData" } };
    return out;
  }
  if (times.length > MAX_SAMPLES) {
    const step = Math.ceil(times.length / MAX_SAMPLES);
    const n = Math.ceil(times.length / step);
    const tt = new Float64Array(n);
    const vv = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      tt[i] = times[i * step];
      vv[i] = values[i * step];
    }
    times = tt;
    values = vv;
  }
  for (const k of kinds) {
    const fn = MEASUREMENTS[k];
    out[k] = fn ? fn(times, values) : { ok: false, reason: { key: "measure.unknown", values: { kind: k } } };
  }
  return out;
}
