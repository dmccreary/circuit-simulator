import { formatValue, type Unit } from "@cs/units";

export const RISE = "#2e7d32";
export const DROP = "#c62828";

/** A signed reading: "+4.50 V", "−1.20 mA". */
export function signed(v: number, unit: Unit): string {
  if (!Number.isFinite(v)) return "–";
  const s = formatValue(Math.abs(v), unit, { digits: 3 });
  return `${v < 0 ? "−" : "+"}${s}`;
}

/**
 * A Kirchhoff sum, shown as exactly zero when it is zero to display
 * precision relative to the terms it adds up (PRB-16, PRB-18).
 */
export function lawSum(sum: number, terms: number[], unit: Unit): string {
  const scale = Math.max(1e-15, ...terms.map((x) => Math.abs(x)));
  const v = Math.abs(sum) < scale * 5e-4 ? 0 : sum;
  return v === 0 ? formatValue(0, unit, { digits: 3 }) : signed(v, unit);
}
