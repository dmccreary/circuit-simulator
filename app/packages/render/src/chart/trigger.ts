// Trigger detection for the triggered sweep mode (rendering.md §5.4, CHT-10).
// The scanner watches only new samples of the trigger trace, so cost per
// frame is proportional to the samples that frame added.

import type { TimeWindow } from "./time-window";
import type { TriggerSpec } from "./types";

/**
 * Crossing times of `level` in the given direction, located by linear
 * interpolation. `hysteresis` (in value units) must be cleared on the other
 * side before the next crossing counts, so noise does not re-trigger.
 */
export function findCrossings(
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  level: number,
  edge: "rising" | "falling",
  hysteresis = 0,
): number[] {
  const s = new CrossingScanner();
  s.configure(level, edge, hysteresis);
  s.feed(times, values);
  return s.crossings;
}

/** Incremental crossing detector; remembers its arm state between feeds. */
export class CrossingScanner {
  crossings: number[] = [];
  /** Time of the last sample fed. */
  lastT = -Infinity;
  private prevT = NaN;
  private prevV = NaN;
  private armed = false;
  private level = 0;
  private sign = 1;
  private hyst = 0;

  configure(level: number, edge: "rising" | "falling", hysteresis = 0): void {
    if (level === this.level && this.sign === (edge === "rising" ? 1 : -1) && hysteresis === this.hyst) return;
    this.level = level;
    this.sign = edge === "rising" ? 1 : -1;
    this.hyst = Math.abs(hysteresis);
    this.reset();
  }

  reset(): void {
    this.crossings = [];
    this.lastT = -Infinity;
    this.prevT = NaN;
    this.prevV = NaN;
    this.armed = false;
  }

  /** Feed samples in time order; samples at or before `lastT` are skipped. */
  feed(times: ArrayLike<number>, values: ArrayLike<number>): void {
    const n = Math.min(times.length, values.length);
    const L = this.level * this.sign;
    for (let i = 0; i < n; i++) {
      const t = times[i];
      if (!(t > this.lastT)) continue;
      this.lastT = t;
      const raw = values[i];
      if (!Number.isFinite(raw)) {
        this.prevV = NaN;
        continue;
      }
      // Work in "rising" terms: falling edges are rising edges of -v.
      const v = raw * this.sign;
      if (v < L - this.hyst || (this.hyst === 0 && v < L)) this.armed = true;
      if (this.armed && v >= L && Number.isFinite(this.prevV) && this.prevV < L) {
        const f = (L - this.prevV) / (v - this.prevV);
        this.crossings.push(this.prevT + f * (t - this.prevT));
        this.armed = false;
      }
      this.prevT = t;
      this.prevV = v;
    }
  }

  /** Forget crossings before t (bounds memory on long runs). */
  prune(t: number): void {
    let k = 0;
    while (k < this.crossings.length && this.crossings[k] < t) k++;
    if (k) this.crossings.splice(0, k);
  }
}

export interface TriggerResult {
  window: TimeWindow;
  /** The trigger time, when the window came from a trigger. */
  at?: number;
  status: "triggered" | "auto" | "waiting" | "captured";
}

/**
 * Chooses the triggered window from the crossings found so far. A window
 * stays on screen until it is complete; then the newest crossing whose whole
 * window is available replaces it (so fast runs do not lag behind).
 */
export class TriggerTracker {
  readonly scanner = new CrossingScanner();
  private current: TriggerResult | undefined;
  private channel: string | undefined;

  reset(): void {
    this.scanner.reset();
    this.current = undefined;
  }

  /** Re-arm a Single sweep. */
  rearm(): void {
    this.current = undefined;
  }

  update(
    spec: TriggerSpec,
    latest: number,
    span: number,
    read: (t0: number, t1: number) => { times: ArrayLike<number>; values: ArrayLike<number> } | undefined,
  ): TriggerResult {
    if (spec.channelId !== this.channel) {
      this.channel = spec.channelId;
      this.reset();
    }
    const sc = this.scanner;
    sc.configure(spec.level, spec.edge);
    if (latest < sc.lastT) this.reset(); // history was truncated or reset
    if (spec.channelId && latest > sc.lastT) {
      const from = Number.isFinite(sc.lastT) ? sc.lastT : Math.max(0, latest - 2 * span);
      const s = read(from, latest);
      if (s) sc.feed(s.times, s.values);
      sc.prune(latest - 4 * span);
    }
    const pre = Math.min(0.9, Math.max(0, spec.pre));
    const windowAt = (tc: number): TimeWindow => ({ t0: tc - pre * span, t1: tc + (1 - pre) * span });
    const cur = this.current;
    if (cur && cur.status === "captured") return cur;
    if (cur && cur.at !== undefined && latest < cur.window.t1) return cur; // still filling

    const after = cur?.at !== undefined ? cur.window.t1 - pre * span : -Infinity;
    const cands = sc.crossings.filter((t) => t > after);
    const complete = cands.filter((t) => windowAt(t).t1 <= latest);
    let tc: number | undefined = complete.length ? complete[complete.length - 1] : cands[0];
    if (tc !== undefined) {
      const done = windowAt(tc).t1 <= latest;
      this.current = { window: windowAt(tc), at: tc, status: spec.sweep === "single" && done ? "captured" : "triggered" };
      return this.current;
    }
    tc = undefined;
    if (spec.sweep === "auto") {
      // Free-run once a whole window has passed with no trigger.
      const lastTrig = cur?.at ?? -Infinity;
      if (latest - lastTrig > span || !cur) {
        const start = Math.floor(latest / span) * span;
        return { window: { t0: start, t1: start + span }, status: "auto" };
      }
    }
    if (cur) return cur;
    const start = Math.floor(latest / span) * span;
    return { window: { t0: start, t1: start + span }, status: "waiting" };
  }
}
