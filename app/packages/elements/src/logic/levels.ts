// Logic families (DIG-01, DIG-04): supply, output levels and resistance,
// input thresholds, optional Schmitt hysteresis.

import type { PropSpec } from "../api";
import { bool, num, str, type Props } from "../shared/props";

export type Logic = "0" | "1" | "X" | "Z";

export interface DigitalLevels {
  vHigh: number;
  vLow: number;
  rOut: number;
  vth: number;
  vRise: number;
  vFall: number;
}

export const FAMILIES = ["cmos", "ttl"] as const;

/** CMOS: rail-to-rail, threshold at half the supply. TTL: 0.2 V / supply − 1.6 V out, 1.4 V threshold. */
export function levelsFromProps(p: Props): DigitalLevels {
  const supply = Math.max(0.1, num(p, "supply", 5));
  const rOut = Math.max(1e-6, num(p, "outputResistance", 25));
  const schmitt = bool(p, "schmitt", false);
  if (str(p, "family", "cmos") === "ttl") {
    const vth = 1.4;
    return { vHigh: Math.max(0.2, supply - 1.6), vLow: 0.2, rOut, vth, vRise: schmitt ? 1.7 : vth, vFall: schmitt ? 0.9 : vth };
  }
  const vth = supply / 2;
  return { vHigh: supply, vLow: 0, rOut, vth, vRise: schmitt ? 0.6 * supply : vth, vFall: schmitt ? 0.4 * supply : vth };
}

/** Supply, family and output resistance: every logic part. */
export const LEVEL_PROPS: PropSpec[] = [
  { key: "supply", unit: "V", range: [0.1, 30], default: 5 },
  { key: "family", unit: "", kind: "enum", options: [...FAMILIES], default: "cmos" },
  { key: "outputResistance", unit: "ohm", range: [0, 1e6], default: 25 },
];

/** Propagation delay (DIG-05, zero by default) and Schmitt inputs: parts with inputs. */
export const TIMING_PROPS: PropSpec[] = [
  { key: "delay", unit: "s", range: [0, 1], default: 0 },
  { key: "schmitt", unit: "", kind: "boolean", default: false },
];

/** Logic channel / readout encoding: 0, 1, 0.5 for X, NaN for Z. */
export function logicNumber(s: Logic): number {
  return s === "1" ? 1 : s === "0" ? 0 : s === "X" ? 0.5 : NaN;
}

export const not = (a: Logic): Logic => (a === "1" ? "0" : a === "0" ? "1" : "X");

/** Z on an input reads as X. */
export function and(ins: Logic[]): Logic {
  if (ins.includes("0")) return "0";
  return ins.every((s) => s === "1") ? "1" : "X";
}

export function or(ins: Logic[]): Logic {
  if (ins.includes("1")) return "1";
  return ins.every((s) => s === "0") ? "0" : "X";
}

export function xor(ins: Logic[]): Logic {
  if (ins.some((s) => s !== "0" && s !== "1")) return "X";
  return ins.filter((s) => s === "1").length % 2 === 1 ? "1" : "0";
}
