// Spectrum of a trace (ANL-22–25, history-and-analysis.md §5.3): resample the
// variable-step trace onto a uniform grid, apply a window, take an FFT, and
// find the fundamental and harmonics for THD. Twiddles and windows use the
// deterministic math library (SIM-23).

import { cos, sin } from "@cs/dmath";
import type { AnalysisProgress, Harmonic, SpectrumResult, WindowShape } from "./types";

const MIN_N = 64;
const MAX_N = 1 << 16;
const MAX_HARMONIC = 10;
/** Main-lobe half-width in bins, used to sum a peak's power. */
const LOBE: Record<WindowShape, number> = { rect: 1, hann: 2, flattop: 5 };
const FLATTOP = [0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368];

/** In-place iterative radix-2 FFT; re.length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wr = new Float64Array(half);
    const wi = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      wr[k] = cos(ang * k);
      wi[k] = sin(ang * k);
    }
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b] * wr[k] - im[b] * wi[k];
        const ti = re[b] * wi[k] + im[b] * wr[k];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

export function windowValues(shape: WindowShape, n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = (2 * Math.PI * i) / n; // periodic form
    if (shape === "rect") w[i] = 1;
    else if (shape === "hann") w[i] = 0.5 - 0.5 * cos(x);
    else w[i] = FLATTOP[0] - FLATTOP[1] * cos(x) + FLATTOP[2] * cos(2 * x) - FLATTOP[3] * cos(3 * x) + FLATTOP[4] * cos(4 * x);
  }
  return w;
}

/** Linear interpolation of (times, values) at n uniform points t0 + i·(t1 - t0)/n. */
export function resample(times: ArrayLike<number>, values: ArrayLike<number>, t0: number, t1: number, n: number): Float64Array {
  const out = new Float64Array(n);
  const dt = (t1 - t0) / n;
  let j = 0;
  const m = times.length;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    while (j < m - 2 && times[j + 1] <= t) j++;
    if (m === 1) out[i] = values[0];
    else if (t <= times[0]) out[i] = values[0];
    else if (t >= times[m - 1]) out[i] = values[m - 1];
    else {
      const ta = times[j];
      const tb = times[j + 1];
      out[i] = tb > ta ? values[j] + ((values[j + 1] - values[j]) * (t - ta)) / (tb - ta) : values[j + 1];
    }
  }
  return out;
}

function nextPow2(x: number): number {
  let n = MIN_N;
  while (n < x && n < MAX_N) n <<= 1;
  return n;
}

export interface SpectrumJob {
  times: ArrayLike<number>;
  values: ArrayLike<number>;
  window?: WindowShape;
  t0?: number;
  t1?: number;
}

export function spectrum(job: SpectrumJob): SpectrumResult {
  const shape = job.window ?? "hann";
  const m = job.times.length;
  const empty: SpectrumResult = { kind: "spectrum", freqs: [], amplitude: [], resolution: 0, sampleCount: 0, window: shape, harmonics: [] };
  if (m < 2) return empty;
  const t0 = job.t0 ?? job.times[0];
  const t1 = job.t1 ?? job.times[m - 1];
  if (!(t1 > t0)) return empty;
  let inside = 0;
  for (let i = 0; i < m; i++) if (job.times[i] >= t0 && job.times[i] <= t1) inside++;
  const n = nextPow2(Math.max(inside, 2));
  const x = resample(job.times, job.values, t0, t1, n);
  const w = windowValues(shape, n);
  let sw = 0;
  let sw2 = 0;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = x[i] * w[i];
    sw += w[i];
    sw2 += w[i] * w[i];
  }
  fft(re, im);
  const df = 1 / (t1 - t0);
  const half = n / 2;
  const power = new Float64Array(half + 1);
  const freqs: number[] = [];
  const amplitude: number[] = [];
  for (let k = 0; k <= half; k++) {
    power[k] = re[k] * re[k] + im[k] * im[k];
    freqs.push(k * df);
    amplitude.push(((k === 0 || k === half ? 1 : 2) * Math.sqrt(power[k])) / sw);
  }
  const lobe = LOBE[shape];
  /** Amplitude and frequency of the peak around bin k, from the power in its main lobe (Parseval). */
  const peakAt = (k: number, width = lobe): { amp: number; freq: number } => {
    let p = 0;
    let pk = 0;
    for (let j = Math.max(1, k - width); j <= Math.min(half - 1, k + width); j++) {
      p += power[j];
      pk += power[j] * j;
    }
    return { amp: 2 * Math.sqrt(p / (n * sw2)), freq: p > 0 ? (pk / p) * df : k * df };
  };
  // Fundamental: the strongest non-DC bin, past the DC lobe.
  let k0 = -1;
  for (let k = lobe + 1; k < half; k++) if (k0 < 0 || power[k] > power[k0]) k0 = k;
  const result: SpectrumResult = { kind: "spectrum", freqs, amplitude, resolution: df, sampleCount: n, window: shape, harmonics: [] };
  if (k0 < 0 || !(power[k0] > 0)) return result;
  const f = peakAt(k0);
  result.fundamental = { n: 1, freq: f.freq, amplitude: f.amp };
  const kf = f.freq / df;
  // Sum each harmonic's power only over bins nearer to it than to its neighbours.
  const width = Math.max(0, Math.min(lobe, Math.floor(kf / 2) - 1));
  let sumSq = 0;
  for (let h = 2; h <= MAX_HARMONIC; h++) {
    const centre = Math.round(h * kf);
    if (centre + width >= half) break;
    let best = centre;
    for (let j = centre - 1; j <= centre + 1; j++) if (j > 0 && power[j] > power[best]) best = j;
    const p = peakAt(best, width);
    const hm: Harmonic = { n: h, freq: h * f.freq, amplitude: p.amp };
    result.harmonics.push(hm);
    sumSq += p.amp * p.amp;
  }
  result.thd = f.amp > 0 ? Math.sqrt(sumSq) / f.amp : undefined;
  return result;
}

// eslint-disable-next-line require-yield
export function* spectrumAnalysis(job: SpectrumJob): Generator<AnalysisProgress, SpectrumResult> {
  return spectrum(job);
}
