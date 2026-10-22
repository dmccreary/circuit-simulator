// Explain this value (PRB-21): the law that sets a part's present values,
// filled in with the live numbers, for example
// "I = V ÷ R = 4.50 V ÷ 1.00 kΩ = 4.50 mA".

import type { Part } from "@cs/model";
import { formatValue, type Unit } from "@cs/units";
import type { LiveSource } from "../probes/evaluate";
import { partVIP } from "./readings";

const f = (v: number, unit: Unit) => (Number.isFinite(v) ? formatValue(v, unit, { digits: 3 }) : "–");
/** A rate such as "2.30 kV/s" (the unit table has no per-second units). */
const rate = (v: number, unit: Unit) => `${f(v, unit)}/s`;
const num = (p: Part, k: string) => (typeof p.props[k] === "number" ? (p.props[k] as number) : undefined);

const SOURCES = new Set(["dc-source", "ac-source", "battery", "square-source", "waveform-source", "rail", "current-source"]);

/** Lines of explanation for a part, or [] when there is nothing live to explain. */
export function explainPart(src: LiveSource, part: Part): string[] {
  const vip = partVIP(src, part.id);
  if (!vip || vip.v === undefined || vip.i === undefined) return [];
  const { v, i } = vip;
  const p = v * i;
  const R = num(part, "resistance");
  const C = num(part, "capacitance");
  const L = num(part, "inductance");
  const lines: string[] = [];
  if (part.type === "resistor" && R) {
    lines.push(`I = V ÷ R = ${f(v, "V")} ÷ ${f(R, "ohm")} = ${f(v / R, "A")}`);
    lines.push(`P = V × I = ${f(v, "V")} × ${f(i, "A")} = ${f(p, "W")}`);
  } else if (part.type === "capacitor" && C) {
    lines.push(`i = C × dv/dt = ${f(C, "F")} × ${rate(i / C, "V")} = ${f(i, "A")}`);
    lines.push(`Q = C × V = ${f(C, "F")} × ${f(v, "V")} = ${f(C * v, "")}C`);
  } else if (part.type === "inductor" && L) {
    lines.push(`v = L × di/dt = ${f(L, "H")} × ${rate(v / L, "A")} = ${f(v, "V")}`);
    lines.push(`E = ½ × L × I² = ${f(0.5 * L * i * i, "")}J`);
  } else if (part.type === "lamp" && Math.abs(i) > 1e-15) {
    lines.push(`R = V ÷ I = ${f(v, "V")} ÷ ${f(i, "A")} = ${f(v / i, "ohm")}`);
    lines.push(`P = V × I = ${f(p, "W")}`);
  } else if (SOURCES.has(part.type)) {
    const delivered = -p;
    lines.push(`P = V × I = ${f(v, "V")} × ${f(-i, "A")} = ${f(delivered, "W")} ${delivered >= 0 ? "delivered" : "absorbed"}`);
  } else {
    lines.push(`P = V × I = ${f(v, "V")} × ${f(i, "A")} = ${f(p, "W")} ${p >= 0 ? "absorbed" : "delivered"}`);
  }
  return lines;
}
