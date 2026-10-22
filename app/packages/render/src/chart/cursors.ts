// Time cursors and hover readouts (CHT-25–28).

/** Linear interpolation of samples at time t; NaN outside the samples. */
export function interpolateSamples(times: ArrayLike<number>, values: ArrayLike<number>, t: number): number {
  const n = Math.min(times.length, values.length);
  if (n === 0 || !(t >= times[0]) || !(t <= times[n - 1])) return NaN;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const t0 = times[lo];
  const t1 = times[hi];
  if (t1 === t0) return values[hi];
  return values[lo] + ((values[hi] - values[lo]) * (t - t0)) / (t1 - t0);
}

export interface CursorRow {
  channelId: string;
  name: string;
  unit: string;
  a: number;
  b: number;
  delta: number;
}

export interface CursorReadout {
  a: number;
  b: number;
  dt: number;
  /** 1/Δt in hertz; NaN when the cursors coincide. */
  freq: number;
  rows: CursorRow[];
}

/** Δt, 1/Δt and each trace's values at both cursors. */
export function cursorReadout(
  cursors: { a: number; b: number },
  traces: readonly { channelId: string; name: string; unit: string }[],
  valueAt: (channelId: string, t: number) => number,
): CursorReadout {
  const dt = cursors.b - cursors.a;
  return {
    a: cursors.a,
    b: cursors.b,
    dt,
    freq: dt !== 0 ? 1 / Math.abs(dt) : NaN,
    rows: traces.map((tr) => {
      const a = valueAt(tr.channelId, cursors.a);
      const b = valueAt(tr.channelId, cursors.b);
      return { channelId: tr.channelId, name: tr.name, unit: tr.unit, a, b, delta: b - a };
    }),
  };
}

/** Which cursor (or the playhead) is within `grab` px of x. */
export function grabbedMarker(
  x: number,
  markers: { id: "a" | "b" | "playhead"; x: number | undefined }[],
  grab: number,
): "a" | "b" | "playhead" | undefined {
  let best: "a" | "b" | "playhead" | undefined;
  let bestD = grab + 1e-9;
  for (const m of markers) {
    if (m.x === undefined) continue;
    const d = Math.abs(m.x - x);
    if (d <= bestD) {
      best = m.id;
      bestD = d;
    }
  }
  return best;
}
