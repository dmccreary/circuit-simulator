// The words of the realism messages (RLM-05, RLM-06, RLM-08): what failed, by
// how much, for how long, and how to prevent it. Pure, so it is tested alone.

import type { MessageRef } from "@cs/model";
import type { RatingSpec } from "@cs/elements";
import { LED_FORWARD_VOLTAGE } from "@cs/elements";
import { formatValue, nearestStandard } from "@cs/units";

export interface FailureFacts {
  label: string;
  type: string;
  props: Record<string, unknown>;
  spec?: RatingSpec;
  /** Peak of the rated quantity during the overstress. */
  value?: number;
  /** Continuous rating. */
  rating?: number;
  /** How long the part was over its rating, simulated seconds. */
  duration?: number;
  /** Largest voltage in the circuit (the supply, for the LED advice). */
  supply?: number;
}

const fmt = (v: number, unit: "A" | "W" | "V" | "s" | "ohm") => formatValue(v, unit, { digits: 2, trimZeros: true });

/** The limit quoted to the student: the absolute limit for currents ("30 mA"), the rating otherwise. */
export function quotedLimit(spec: RatingSpec, rating: number): number {
  return spec.quantity === "current" ? rating * spec.absolute : rating;
}

const POWER_RATINGS = [0.125, 0.25, 0.5, 1, 2, 3, 5, 10, 25, 50, 100];

/** Series resistor for an LED at 20 mA from `supply` volts, as the nearest E24 value. */
export function ledResistor(supply: number, color: string): number | undefined {
  const vf = LED_FORWARD_VOLTAGE[color] ?? 1.8;
  if (!(supply > vf)) return undefined;
  return nearestStandard((supply - vf) / 0.02, "E24");
}

export function adviceFor(f: FailureFacts): MessageRef {
  switch (f.type) {
    case "led": {
      const color = typeof f.props.color === "string" ? f.props.color : "red";
      const r = f.supply ? ledResistor(f.supply, color) : undefined;
      if (r === undefined || !f.supply) return { key: "realism.advice.diode" };
      return { key: "realism.advice.led", values: { supply: fmt(f.supply, "V"), color, r: fmt(r, "ohm") } };
    }
    case "resistor":
    case "potentiometer": {
      const need = (f.value ?? 0) * 1.5;
      const rating = POWER_RATINGS.find((p) => p >= need) ?? need;
      return { key: "realism.advice.resistor", values: { rating: fmt(rating, "W") } };
    }
    case "lamp":
      return { key: "realism.advice.lamp" };
    case "capacitor":
      return { key: "realism.advice.capacitor", values: { value: fmt(f.value ?? 0, "V") } };
    case "fuse":
      return { key: "realism.advice.fuse" };
    case "diode":
    case "zener-diode":
      return { key: "realism.advice.diode" };
    case "npn-transistor":
    case "pnp-transistor":
    case "n-mosfet":
    case "p-mosfet":
      return { key: "realism.advice.transistor" };
    default:
      return { key: "realism.advice.generic" };
  }
}

/**
 * RLM-06: "D1 failed: 87 mA flowed through it for 0.4 s; its limit is 30 mA.
 * Add a resistor in series…". `translate` renders the nested advice.
 */
export function failureMessage(f: FailureFacts, translate: (m: MessageRef) => string): MessageRef {
  const spec = f.spec;
  if (!spec || f.value === undefined || f.rating === undefined) return { key: "realism.failed", values: { label: f.label } };
  return {
    key: `realism.failed.${spec.quantity}`,
    values: {
      label: f.label,
      value: fmt(f.value, spec.unit as "A" | "W" | "V"),
      time: fmt(Math.max(0, f.duration ?? 0), "s"),
      limit: fmt(quotedLimit(spec, f.rating), spec.unit as "A" | "W" | "V"),
      advice: translate(adviceFor(f)),
    },
  };
}

/** RLM-05: "R1 is dissipating 0.40 W; its rating is 0.25 W." */
export function overRatingMessage(label: string, spec: RatingSpec, value: number, rating: number): MessageRef {
  return { key: `realism.over.${spec.quantity}`, values: { label, value: fmt(value, spec.unit as "A"), limit: fmt(rating, spec.unit as "A") } };
}

/** RLM-08: far beyond a typical rating with ratings off. */
export function idealHintMessage(label: string, spec: RatingSpec, value: number): MessageRef {
  return { key: `realism.hint.${spec.quantity}`, values: { label, value: fmt(value, spec.unit as "A") } };
}
