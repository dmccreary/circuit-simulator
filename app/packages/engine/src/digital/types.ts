// What the digital kernel needs from a model beyond the ElementModel contract
// (simulation-engine.md §4). Matched structurally: logic models in
// @cs/elements declare these fields; nothing else changes for analog models.
// TODO(contract): move `digitalPins` and `levels` into ElementModel / TerminalSpec.

import type { DigitalContext, ElementModel } from "@cs/elements";

export type Logic = "0" | "1" | "X" | "Z";

export interface DigitalPinDecl {
  pin: number;
  dir: "in" | "out";
}

/** Electrical levels of a part's pins (DIG-01, DIG-04). */
export interface DigitalLevelsDecl {
  vHigh: number;
  vLow: number;
  /** Output resistance of a D→A bridge, ohms. */
  rOut: number;
  /** Plain input threshold. */
  vth: number;
  /** Rising and falling thresholds; equal to vth unless the input is a Schmitt trigger. */
  vRise: number;
  vFall: number;
}

export interface DigitalModelLike extends ElementModel {
  readonly digitalPins: readonly DigitalPinDecl[];
  readonly levels: DigitalLevelsDecl;
  evaluateDigital(ctx: DigitalContext): void;
}

export function asDigital(m: ElementModel | null | undefined): DigitalModelLike | null {
  if (!m || typeof m.evaluateDigital !== "function") return null;
  const d = m as Partial<DigitalModelLike>;
  return Array.isArray(d.digitalPins) && d.levels ? (m as DigitalModelLike) : null;
}

/**
 * Logic channel encoding (samples of `kind: "logic"` channels):
 * 0 → 0, 1 → 1, X → 0.5, Z → NaN.
 */
export function logicSample(s: Logic): number {
  return s === "1" ? 1 : s === "0" ? 0 : s === "X" ? 0.5 : NaN;
}

/**
 * Discrete block codes (one byte per node in frame order, see worker frame.ts):
 * 0 = low, 1 = high, 2 = X, 3 = Z, 255 = analog node with no digital pins.
 */
export const DISCRETE_ANALOG = 255;
export function logicCode(s: Logic): number {
  return s === "0" ? 0 : s === "1" ? 1 : s === "X" ? 2 : 3;
}

export function levelOf(s: Logic, lv: DigitalLevelsDecl): number {
  return s === "1" ? lv.vHigh : s === "0" ? lv.vLow : (lv.vHigh + lv.vLow) / 2;
}
