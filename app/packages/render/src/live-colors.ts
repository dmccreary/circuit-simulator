// Color math for the live layer (rendering.md §4): voltage gradients inside
// parts (ANI-13), the power view's warm and cool scales (ANI-16), and logic
// level colors on digital wires (ANI-22). Pure functions, so they are tested
// without a canvas.

import type { Theme } from "./theme";
import { voltageColor } from "./theme";

export type Rgb = [number, number, number];

export const rgb = (c: Rgb): string => `rgb(${c.map((v) => Math.round(v)).join(",")})`;

export const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => {
  const u = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};

/** Below this fraction of the voltage range a part shows no gradient (avoids shimmer at 0 V drops). */
export const GRADIENT_MIN_FRACTION = 0.02;

/**
 * Gradient stops along a part from terminal 0 to terminal 1 (ANI-13): the two
 * terminal colors, or undefined when the drop is too small to see.
 */
export function gradientStops(theme: Theme, v0: number, v1: number, range: number): [string, string] | undefined {
  if (!(range > 0) || !Number.isFinite(v0) || !Number.isFinite(v1)) return undefined;
  if (Math.abs(v0 - v1) < GRADIENT_MIN_FRACTION * range) return undefined;
  return [voltageColor(theme, v0, range), voltageColor(theme, v1, range)];
}

const WARM_LOW: Rgb = [255, 213, 79]; // yellow
const WARM_HIGH: Rgb = [245, 124, 0]; // orange
const COOL_LOW: Rgb = [144, 202, 249];
const COOL_HIGH: Rgb = [30, 136, 229]; // blue

/**
 * Power view glow (ANI-16): parts absorbing power glow warm (yellow to orange
 * with |P| ÷ Pmax), parts delivering it glow cool (blue). Alpha also grows with
 * |P| so idle parts stay clear. Undefined below 1% of the largest power.
 */
export function powerColor(p: number, pmax: number): { color: string; alpha: number; absorbing: boolean } | undefined {
  if (!(pmax > 0) || !Number.isFinite(p)) return undefined;
  const t = Math.min(1, Math.abs(p) / pmax);
  if (t < 0.01) return undefined;
  const absorbing = p > 0;
  const c = absorbing ? lerpRgb(WARM_LOW, WARM_HIGH, t) : lerpRgb(COOL_LOW, COOL_HIGH, t);
  return { color: rgb(c), alpha: 0.25 + 0.5 * Math.sqrt(t), absorbing };
}

export type WireLogic = 0 | 1 | "x";

/** Level of a digital node from its voltage: CMOS-style thresholds at 30% and 70% of the supply (DIG-01). */
export function logicOfVoltage(v: number, supply = 5): WireLogic {
  if (!Number.isFinite(v)) return "x";
  if (v >= 0.7 * supply) return 1;
  if (v <= 0.3 * supply) return 0;
  return "x";
}

/** Logic level colors (ANI-22, DIG-07 scheme): high bright, low dark, unknown red. */
export function logicColor(theme: Theme, level: WireLogic): string {
  const dark = theme.name !== "light";
  if (level === "x") return dark ? "#ff6e6e" : "#d32f2f";
  if (level === 1) return rgb(theme.voltPos);
  return dark ? "#5c6bc0" : "#1a237e";
}

/** Number of + and − marks per capacitor plate for a charge level in [0, 1] (ANI-18). */
export function chargeMarks(level: number, max = 5): number {
  if (!(level > 0)) return 0;
  return Math.min(max, Math.ceil(Math.min(1, level) * max));
}
