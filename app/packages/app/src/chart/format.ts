import { formatValue, type Unit } from "@cs/units";
import type { MeasureResult } from "@cs/history";
import { t } from "../messages";

/** "3.30 V", "1.00 kHz"; falls back to a plain number for unknown units. */
export function fmt(v: number, unit: string, digits = 3): string {
  if (!Number.isFinite(v)) return "—";
  try {
    return formatValue(v, unit as Unit, { digits });
  } catch {
    return `${Number(v.toPrecision(digits))}${unit ? ` ${unit}` : ""}`;
  }
}

/** A measurement result for display; ratios ("%") arrive as fractions. */
export function fmtResult(r: MeasureResult | undefined, unit: string): string {
  if (!r) return "—";
  if (!r.ok) return t(r.reason);
  return unit === "%" ? fmt(r.value * 100, "%") : fmt(r.value, unit);
}
