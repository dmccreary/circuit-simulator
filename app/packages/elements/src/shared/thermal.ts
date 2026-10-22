// A one-pole heating model shared by ratings and failure (RLM-05) and by the
// lamp filament glow (ANI-17), which uses the same machinery with ratings off
// (simulation-engine.md §5).
//
// θ is the temperature rise normalized so that 1 is the rise at the part's
// continuous rating. A steady stress ratio s (power ÷ rated power, or
// (current ÷ rated current)²) heats the part toward θ = s with time constant τ:
//
//     dθ/dt = (s − θ) / τ
//
// The part fails when θ passes θ_fail = (absolute ÷ continuous)^n. A brief
// overload therefore survives, a large one fails quickly, and anything at or
// below the continuous rating never fails.

/** Exact update of θ over a step of length dt with constant stress s. */
export function heatStep(theta: number, s: number, dt: number, tau: number): number {
  if (!(dt > 0)) return theta;
  if (!(tau > 0)) return s;
  return s + (theta - s) * Math.exp(-dt / tau);
}

/**
 * Time for a cold part (θ = 0) under constant stress s to reach θ_fail.
 * Infinity when it never does.
 */
export function timeToFail(s: number, thetaFail: number, tau: number): number {
  if (s <= thetaFail) return Infinity;
  return -tau * Math.log(1 - thetaFail / s);
}

/** Stress ratio for a measured quantity against its rating: (|q| ÷ rating)^n. */
export function stressRatio(q: number, rating: number, exponent: number): number {
  if (!(rating > 0) || !Number.isFinite(q)) return 0;
  return Math.pow(Math.abs(q) / rating, exponent);
}

/** Rough part temperature for read-outs: 25 °C cold, 150 °C at the failure point. */
export function temperatureOf(theta: number, thetaFail: number): number {
  return 25 + 125 * (thetaFail > 0 ? theta / thetaFail : 0);
}

/**
 * Glow brightness on a perceptual scale (ANI-17): `fraction` is power (lamp)
 * or current (LED) over its full-brightness value. Lightness follows roughly
 * the cube root of luminance (CIE L*), so half the light reads as about 80%
 * as bright; we map the fraction through that curve so equal steps of power
 * look like equal steps of brightness.
 */
export function perceptualBrightness(fraction: number): number {
  if (!(fraction > 0)) return 0;
  return Math.min(1, Math.cbrt(Math.min(fraction, 1)));
}

/**
 * A filament or other glowing element whose light lags its power: tracks θ
 * with heatStep and reports brightness from it. Pure; used by the renderer.
 */
export class ThermalFilter {
  theta = 0;
  constructor(public tau: number) {}

  /** Advance by dt (simulated seconds) with stress s; returns the new θ. */
  step(s: number, dt: number): number {
    this.theta = heatStep(this.theta, s, dt, this.tau);
    return this.theta;
  }

  reset(theta = 0): void {
    this.theta = theta;
  }
}
