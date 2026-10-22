// Nearest standard value helper (EDT-28).

export type StandardSeries = "E6" | "E12" | "E24";

const SERIES: Record<StandardSeries, number[]> = {
  E6: [1.0, 1.5, 2.2, 3.3, 4.7, 6.8],
  E12: [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
  E24: [
    1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2,
    9.1,
  ],
};

/** The series value closest to `value` on a logarithmic scale. Sign is preserved; 0 and non-finite pass through. */
export function nearestStandard(value: number, series: StandardSeries): number {
  if (value === 0 || !Number.isFinite(value)) return value;
  const mag = Math.abs(value);
  const decade = Math.floor(Math.log10(mag));
  const scale = 10 ** decade;
  const candidates = [...SERIES[series], 10];
  let best = candidates[0];
  let bestErr = Infinity;
  for (const c of candidates) {
    const err = Math.abs(Math.log(mag / (c * scale)));
    if (err < bestErr) {
      bestErr = err;
      best = c;
    }
  }
  return Math.sign(value) * Number((best * scale).toPrecision(3));
}
