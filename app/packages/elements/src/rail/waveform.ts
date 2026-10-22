// Waveforms of CircuitJS1's VoltageElm.getVoltage() and SweepElm, as pure functions.
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/VoltageElm.java
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/SweepElm.java

import type { RailWaveform } from "./descriptor";

export interface WaveParams {
  waveform: RailWaveform;
  voltage: number;
  offset: number;
  frequency: number;
  phaseRad: number;
  duty: number; // 0..1
  maxFrequency: number;
  sweepTime: number;
  logSweep: boolean;
}

const TWO_PI = 2 * Math.PI;
const mod2pi = (w: number) => w - TWO_PI * Math.floor(w / TWO_PI);

export function waveValue(p: WaveParams, t: number): number {
  const w = TWO_PI * p.frequency * t + p.phaseRad;
  const A = p.voltage;
  switch (p.waveform) {
    case "dc":
      return A + p.offset;
    case "ac":
      return Math.sin(w) * A + p.offset;
    case "square":
      return p.offset + (mod2pi(w) > TWO_PI * p.duty ? -A : A);
    case "triangle": {
      const x = mod2pi(w);
      const tri = x < Math.PI ? x * (2 / Math.PI) - 1 : 1 - (x - Math.PI) * (2 / Math.PI);
      return p.offset + tri * A;
    }
    case "sawtooth":
      return p.offset + mod2pi(w) * (A / Math.PI) - A;
    case "pulse":
      return mod2pi(w) < TWO_PI * p.duty ? A + p.offset : p.offset;
    case "noise":
      return p.offset + A * noiseAt(Math.floor(t * 100 * Math.max(1e-9, p.frequency)));
    case "sweep":
      return p.offset + A * Math.sin(sweepPhase(p, t));
  }
}

/** Deterministic pseudo-random value in [-1, 1) for sample k (integer hash), so runs replay exactly. */
export function noiseAt(k: number): number {
  let h = (k | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x80000000 - 1;
}

/** Phase of a repeating sweep from frequency to maxFrequency over sweepTime. */
export function sweepPhase(p: WaveParams, t: number): number {
  const T = Math.max(1e-12, p.sweepTime);
  const n = Math.floor(t / T);
  const tau = t - n * T;
  const f0 = Math.max(1e-12, p.frequency);
  const f1 = Math.max(1e-12, p.maxFrequency);
  const one = (u: number) => {
    if (p.logSweep && f1 !== f0) {
      const k = Math.log(f1 / f0) / T;
      return (TWO_PI * f0 * (Math.exp(k * u) - 1)) / k;
    }
    return TWO_PI * (f0 * u + ((f1 - f0) * u * u) / (2 * T));
  };
  return n * one(T) + one(tau);
}

/** Times in (t0, t1] where the waveform jumps (square and pulse edges, sawtooth resets). */
export function waveEdges(p: WaveParams, t0: number, t1: number, out: number[], max = 1000): void {
  if (!(t1 > t0) || p.frequency <= 0) return;
  const fractions = p.waveform === "square" || p.waveform === "pulse" ? [0, p.duty] : p.waveform === "sawtooth" ? [0] : [];
  if (!fractions.length) return;
  const shift = p.phaseRad / TWO_PI;
  const first = Math.floor(t0 * p.frequency + shift) - 1;
  let pushed = 0;
  for (let k = first; pushed < max; k++) {
    const base = (k - shift) / p.frequency;
    if (base > t1) break;
    for (const f of fractions) {
      const edge = base + f / p.frequency;
      if (edge > t0 && edge <= t1) {
        out.push(edge);
        pushed++;
      }
    }
  }
}
