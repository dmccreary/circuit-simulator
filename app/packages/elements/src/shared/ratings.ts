// Ratings (RLM-04): what each part type is rated for, how it heats, and how it
// fails. The table is data shared by the worker (rated-model.ts decides when a
// part fails) and the main thread (the warning badge and heat bar mirror the
// same heating from the display state, and the failure message quotes it).
//
// A rating's value lives in the part's props under `key` when the student has
// edited it; otherwise `default` applies.

import type { Unit } from "../api";
import type { Props } from "./props";
import { num } from "./props";
import { stressRatio } from "./thermal";

export type FailMode = "open" | "short";

export interface RatingSpec {
  /** Prop holding the rating ("powerRating"); the default applies when absent. */
  key: string;
  /** What is measured against the rating. */
  quantity: "power" | "current" | "voltage";
  unit: Unit;
  /** Continuous rating. */
  default: number;
  /** Absolute limit as a multiple of the continuous rating (θ_fail = absolute^exponent). */
  absolute: number;
  /** Stress grows as (q ÷ rating)^exponent: 1 for power, 2 for current (I²R heating) and voltage. */
  exponent: number;
  /** Heating time constant, seconds. */
  tau: number;
  failMode: FailMode;
  /** For "current": the terminal whose inflowing current is measured (default 0). */
  terminal?: number;
  /** For "voltage": V(pair[0]) − V(pair[1]) (default [0, 1]). */
  pair?: [number, number];
  /** For "voltage": count only this polarity (+1 forward, −1 reverse); default both. */
  polarity?: 1 | -1;
  /** Terminals joined when the part fails short (default [0, 1]). */
  shortPair?: [number, number];
}

const power = (def: number, tau: number, failMode: FailMode, extra: Partial<RatingSpec> = {}): RatingSpec => ({
  key: "powerRating",
  quantity: "power",
  unit: "W",
  default: def,
  absolute: 2,
  exponent: 1,
  tau,
  failMode,
  ...extra,
});

/** Ratings by part type (RLM-04 table). Types without an entry never fail. */
export const RATINGS: Record<string, readonly RatingSpec[]> = {
  resistor: [power(0.25, 2, "open")],
  potentiometer: [power(0.25, 2, "open")],
  // 20 mA continuous, 30 mA absolute: θ_fail = 1.5² = 2.25.
  led: [{ key: "currentRating", quantity: "current", unit: "A", default: 0.02, absolute: 1.5, exponent: 2, tau: 3, failMode: "open" }],
  diode: [
    { key: "currentRating", quantity: "current", unit: "A", default: 1, absolute: 2, exponent: 2, tau: 1, failMode: "short" },
    { key: "reverseVoltageRating", quantity: "voltage", unit: "V", default: 400, absolute: 1.1, exponent: 2, tau: 0.01, failMode: "short", polarity: -1 },
  ],
  "zener-diode": [power(0.5, 1, "short")],
  // The filament opens at twice its rated power (about 1.4× its rated voltage).
  lamp: [power(3, 0.1, "open", { key: "ratedPower" })],
  capacitor: [
    { key: "voltageRating", quantity: "voltage", unit: "V", default: 25, absolute: 1.2, exponent: 2, tau: 0.05, failMode: "short" },
  ],
  // A time-delay fuse: carries its rating forever, 1.35× eventually, 10× in a few ms.
  fuse: [{ key: "currentRating", quantity: "current", unit: "A", default: 1, absolute: 1.35, exponent: 2, tau: 0.5, failMode: "open" }],
  "npn-transistor": [
    power(0.625, 1, "short", { shortPair: [1, 2] }),
    { key: "currentRating", quantity: "current", unit: "A", default: 0.2, absolute: 2, exponent: 2, tau: 0.5, failMode: "short", terminal: 1, shortPair: [1, 2] },
  ],
  "pnp-transistor": [
    power(0.625, 1, "short", { shortPair: [1, 2] }),
    { key: "currentRating", quantity: "current", unit: "A", default: 0.2, absolute: 2, exponent: 2, tau: 0.5, failMode: "short", terminal: 1, shortPair: [1, 2] },
  ],
  "n-mosfet": [power(0.4, 1, "short", { shortPair: [1, 2] })],
  "p-mosfet": [power(0.4, 1, "short", { shortPair: [1, 2] })],
};

export function ratingsFor(type: string): readonly RatingSpec[] {
  return RATINGS[type] ?? [];
}

/** The rating's value for this part: the edited prop, or the default. */
export function ratingValue(spec: RatingSpec, props: Props): number {
  const v = num(props, spec.key, spec.default);
  return v > 0 ? v : spec.default;
}

/** θ at which the part fails. */
export const failThreshold = (spec: RatingSpec): number => Math.pow(spec.absolute, spec.exponent);

/**
 * The rated quantity from terminal voltages and the currents into each
 * terminal (the same numbers the display state carries, so the main thread
 * computes exactly what the worker does).
 */
export function measure(spec: RatingSpec, volts: ArrayLike<number>, currents: ArrayLike<number>): number {
  switch (spec.quantity) {
    case "power": {
      let p = 0;
      for (let i = 0; i < currents.length; i++) p += (volts[i] ?? 0) * currents[i];
      return Math.abs(p);
    }
    case "current":
      return Math.abs(currents[spec.terminal ?? 0] ?? 0);
    case "voltage": {
      const [a, b] = spec.pair ?? [0, 1];
      const v = (volts[a] ?? 0) - (volts[b] ?? 0);
      if (spec.polarity === 1) return Math.max(0, v);
      if (spec.polarity === -1) return Math.max(0, -v);
      return Math.abs(v);
    }
  }
}

/** Stress ratio s for one rating (θ heads toward s). */
export function ratingStress(spec: RatingSpec, props: Props, volts: ArrayLike<number>, currents: ArrayLike<number>): number {
  return stressRatio(measure(spec, volts, currents), ratingValue(spec, props), spec.exponent);
}

/** The value of the `failed` prop: "" (working), "open" or "short". */
export function failedMode(props: Props): FailMode | undefined {
  const f = props.failed;
  return f === "open" || f === "short" ? f : undefined;
}

/** Prop that records a failure in the document (RLM-07: Repair and Undo clear it). */
export const FAILED_PROP = "failed";
