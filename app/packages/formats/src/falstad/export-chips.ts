// Falstad export candidates for the chip families (the inverse of
// mapping-chips.ts). Unrotated parts only: point1 is where Falstad's slot W0
// lands, found from our terminal 0. Each candidate is kept by export.ts only
// when it re-imports to the same placement. Bus forms (XML only), bus inputs
// and instruction displays have no text form and are skipped.

import type { Part } from "@cs/model";
import { escapeFalstad } from "./text";

const PX = 16;
type Num = number | string;
const FLAG_CUSTOM_VOLTAGE = 1 << 13;

const n = (p: Part, key: string, fallback: number): number => {
  const v = p.props[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
};
const b = (p: Part, key: string, fallback = false): boolean => (typeof p.props[key] === "boolean" ? p.props[key] === true : fallback);
const s = (p: Part, key: string): string => (typeof p.props[key] === "string" ? (p.props[key] as string) : "");

/** Saved pin values (chip-kit state layout [lastClock, pin 0, ...]) as Falstad volts. */
const volts = (p: Part, first: number, count: number, high: number): number[] =>
  Array.from({ length: count }, (_, i) => ((p.savedState ?? [])[1 + first + i] === 1 ? high : 0));

/** Chip line: point1 is terminal 0 minus its offset `pin0` (grid units) from slot W0. */
function chipLine(part: Part, code: string, pin0: [number, number], flags: number, bits: number | null, ...rest: Num[]): string {
  const x = part.at.x - pin0[0];
  const y = part.at.y - pin0[1];
  const supply = n(part, "supply", 5);
  const f = supply !== 5 ? flags | FLAG_CUSTOM_VOLTAGE : flags;
  const head: Num[] = [...(bits !== null ? [bits] : []), ...(supply !== 5 ? [supply] : [])];
  return [code, x * PX, y * PX, (x + 2) * PX, y * PX, f, ...head, ...rest].join(" ");
}

/** Candidate lines, or null when the part is not a chip. */
export function chipsCandidates(part: Part): string[] | null {
  if (part.orientation.rot !== 0 || part.orientation.flip) return chipType(part.type) ? [] : null;
  const hi = n(part, "supply", 5);
  const t = part.type;
  let m: RegExpExecArray | null;
  if ((m = /^counter-(\d+)$/.exec(t))) {
    const bits = Number(m[1]);
    return [chipLine(part, "164", [0, 0], b(part, "negativeEdge") ? 8 : 0, bits, ...volts(part, 2, bits, hi), String(b(part, "invertReset")), n(part, "modulus", 0))];
  }
  if ((m = /^sync-counter-(\d+)$/.exec(t))) {
    const bits = Number(m[1]);
    return [chipLine(part, "421", [6, 2], 0, bits, ...volts(part, 0, bits, hi), n(part, "modulus", 0))];
  }
  if ((m = /^ring-counter-(\d+)(-ce)?$/.exec(t))) {
    const bits = Number(m[1]);
    const flags = (m[2] ? 2 : 0) | (b(part, "invertReset", true) ? 0 : 4);
    return [chipLine(part, "163", [0, 2], flags, bits, ...volts(part, 2, bits, hi))];
  }
  if ((m = /^multiplexer-(\d)$/.exec(t))) return [chipLine(part, "184", [0, 0], 0, null, Number(m[1]))];
  if ((m = /^demultiplexer-(\d)$/.exec(t))) {
    const sel = Number(m[1]);
    return [chipLine(part, "185", [2 * (sel + 2), 0], b(part, "idleHigh") ? 16 : 0, null, sel)];
  }
  if (t === "full-adder") return [chipLine(part, "196", [0, 0], 0, null)];
  if ((m = /^full-adder-(\d+)$/.exec(t))) return [chipLine(part, "196", [0, 2 * (Number(m[1]) - 1)], 2, Number(m[1]))];
  if ((m = /^t-flip-flop(-r|-sr)?$/.exec(t))) {
    const flags = m[1] === "-sr" ? 4 : m[1] === "-r" ? 2 : 0;
    return [chipLine(part, "193", [0, 0], flags, null, ...volts(part, 1, 1, hi))];
  }
  if ((m = /^latch-(\d+)$/.exec(t))) {
    const bits = Number(m[1]);
    return [chipLine(part, "168", [0, 2 * (bits - 1)], 2 | (b(part, "edgeTriggered", true) ? 0 : 4), bits, ...volts(part, bits, bits, hi))];
  }
  if ((m = /^(dac|adc)-(\d+)$/.exec(t))) {
    const bits = Number(m[2]);
    return [chipLine(part, m[1] === "dac" ? "166" : "167", [m[1] === "dac" ? 0 : 6, 2 * (bits - 1)], 0, bits)];
  }
  if ((m = /^seven-seg-decoder(-bi)?$/.exec(t))) {
    return [chipLine(part, "197", [8, 0], (m[1] ? 2 : 0) | (b(part, "blankOnF") ? 4 : 0), null, 0)];
  }
  if ((m = /^led-array-(\d+)x(\d+)$/.exec(t))) {
    const rows = Number(m[2]);
    return [chipLine(part, "405", [2, 2 * rows], 0, null, Number(m[1]), rows)];
  }
  if ((m = /^rom-(\d+)x(\d+)$/.exec(t))) {
    const runs: Num[] = [];
    for (const line of s(part, "contents").split("\n")) {
      const r = /^\s*(\d+)\s*:\s*(.*)$/.exec(line);
      if (!r) continue;
      const vals = r[2].trim().split(/\s+/).filter((v) => /^\d+$/.test(v));
      if (vals.length) runs.push(Number(r[1]), ...vals, -1);
    }
    return [chipLine(part, "436", [0, 0], 0, null, Number(m[1]), Number(m[2]), ...runs, -2)];
  }
  if ((m = /^custom-logic-(\d)x(\d)$/.exec(t))) {
    const ni = Number(m[1]);
    const no = Number(m[2]);
    const name = `${part.label || part.id}-logic`;
    const model = ["!", escapeFalstad(name), 0, escapeFalstad(s(part, "inputNames") || defaultNames(0, ni)),
      escapeFalstad(s(part, "outputNames") || defaultNames(ni, no)), escapeFalstad(s(part, "title") || name), escapeFalstad(s(part, "rules"))].join(" ");
    return [`${model}\n${chipLine(part, "208", [0, 0], 0, null, escapeFalstad(name), ...volts(part, ni, no, hi))}`];
  }
  return null;
}

const defaultNames = (from: number, count: number) => Array.from({ length: count }, (_, i) => String.fromCharCode(65 + from + i)).join(",");

const chipType = (t: string) =>
  /^(counter|sync-counter|ring-counter|multiplexer|demultiplexer|full-adder|t-flip-flop|latch|dac|adc|seven-seg-decoder|led-array|rom|custom-logic)(-|$)/.test(t);

