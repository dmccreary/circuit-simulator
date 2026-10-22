// Number entry (EDT-26): plain/scientific numbers, SI prefixes, optional unit
// symbol, R notation ("4k7", "2R2"), and comma decimals.

import { matchUnit, type Unit } from "./unit";

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; error: "empty" | "syntax" | "wrong-unit"; found?: Unit };

const PREFIX: Record<string, number> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  "µ": 1e-6, // U+00B5 micro sign
  "μ": 1e-6, // U+03BC Greek mu
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

const NUMBER_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(.*)$/;
const R_NOTATION_RE = /^([+-]?\d+)(meg|[fpnuµμmkKMGTRr])(\d+)(.*)$/i;

/** Normalize whitespace and the decimal separator. */
function normalize(text: string): string {
  let s = text.replace(/[\s   ]+/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: the later one is the decimal mark, the other groups digits.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.indexOf(",") === lastComma ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  return s;
}

function prefixOf(token: string): number | undefined {
  if (token.toLowerCase() === "meg") return 1e6;
  if (token === "R" || token === "r") return 1;
  return PREFIX[token];
}

/** Split a suffix like "kΩ" into multiplier and unit. */
function parseSuffix(rest: string): { mult: number; unit?: Unit } | undefined {
  if (rest === "") return { mult: 1 };
  const whole = matchUnit(rest);
  if (whole !== undefined) return { mult: 1, unit: whole };
  if (rest.slice(0, 3).toLowerCase() === "meg") {
    const tail = rest.slice(3);
    if (tail === "") return { mult: 1e6 };
    const u = matchUnit(tail);
    return u === undefined ? undefined : { mult: 1e6, unit: u };
  }
  const mult = PREFIX[rest[0]];
  if (mult === undefined) return undefined;
  const tail = rest.slice(1);
  if (tail === "") return { mult };
  const u = matchUnit(tail);
  return u === undefined ? undefined : { mult, unit: u };
}

/** Parse with an explanation of failure. `unit` undefined accepts any unit symbol. */
export function parseValueDetailed(text: string, unit?: Unit): ParseResult {
  const s = normalize(text);
  if (s === "") return { ok: false, error: "empty" };

  let value: number;
  let suffix: { mult: number; unit?: Unit } | undefined;

  const r = R_NOTATION_RE.exec(s);
  if (r) {
    const mult = prefixOf(r[2]);
    const tail = r[4] === "" ? { mult: 1 } : matchUnit(r[4]) !== undefined ? { mult: 1, unit: matchUnit(r[4]) } : undefined;
    if (mult === undefined || !tail) return { ok: false, error: "syntax" };
    const sign = r[1].startsWith("-") ? -1 : 1;
    value = sign * parseFloat(`${r[1].replace(/^[+-]/, "")}.${r[3]}`) * mult;
    suffix = tail;
  } else {
    const m = NUMBER_RE.exec(s);
    if (!m) return { ok: false, error: "syntax" };
    suffix = parseSuffix(m[2]);
    if (!suffix) return { ok: false, error: "syntax" };
    value = parseFloat(m[1]) * suffix.mult;
  }

  if (suffix.unit !== undefined && unit !== undefined && suffix.unit !== unit) {
    return { ok: false, error: "wrong-unit", found: suffix.unit };
  }
  if (!Number.isFinite(value)) return { ok: false, error: "syntax" };
  // Undo binary noise from prefix multiplication ("4.7k" -> 4700, not 4700.000000000001).
  return { ok: true, value: Number(value.toPrecision(15)) };
}

/** Parse a typed value; null when it is not a number or carries the wrong unit. */
export function parseValue(text: string, unit?: Unit): number | null {
  const r = parseValueDetailed(text, unit);
  return r.ok ? r.value : null;
}
