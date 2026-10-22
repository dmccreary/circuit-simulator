// Engineering-notation display with SI prefixes (EDT-26: three significant
// figures by default, "4.70 kΩ", "33.0 nF").

import { UNIT_SYMBOL, UNPREFIXED, type Unit } from "./unit";

export interface FormatOptions {
  /** Significant figures; default 3. */
  digits?: number;
  /** BCP 47 locale; only its decimal mark is used. */
  locale?: string;
  /** Drop trailing zeros ("4.7 kΩ" instead of "4.70 kΩ"). */
  trimZeros?: boolean;
}

const PREFIXES: [number, string][] = [
  [-15, "f"],
  [-12, "p"],
  [-9, "n"],
  [-6, "µ"],
  [-3, "m"],
  [0, ""],
  [3, "k"],
  [6, "M"],
  [9, "G"],
  [12, "T"],
];

const decimalCache = new Map<string, string>();
function decimalMark(locale?: string): string {
  if (!locale) return ".";
  let mark = decimalCache.get(locale);
  if (mark === undefined) {
    try {
      mark = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
    } catch {
      mark = ".";
    }
    decimalCache.set(locale, mark);
  }
  return mark;
}

/** Mantissa text with `digits` significant figures, for |m| in [1, 1000). */
function mantissa(m: number, digits: number, trim: boolean): string {
  const intDigits = Math.abs(m) >= 100 ? 3 : Math.abs(m) >= 10 ? 2 : 1;
  let s = m.toFixed(Math.max(0, digits - intDigits));
  if (trim && s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s;
}

function join(num: string, prefix: string, symbol: string): string {
  const tail = prefix + symbol;
  return tail ? `${num} ${tail}` : num;
}

export function formatValue(value: number, unit: Unit, opts: FormatOptions = {}): string {
  const digits = Math.max(1, Math.min(15, opts.digits ?? 3));
  const trim = opts.trimZeros ?? false;
  const symbol = UNIT_SYMBOL[unit];
  const dec = decimalMark(opts.locale);
  const local = (s: string) => (dec === "." ? s : s.replace(".", dec));

  if (Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return join(value < 0 ? "−∞" : "∞", "", symbol);
  if (value === 0) return join("0", "", symbol);

  if (UNPREFIXED.has(unit)) {
    const r = Number(value.toPrecision(digits));
    return join(local(trim ? String(r) : r.toPrecision(digits)), "", symbol);
  }

  // Round first, then pick the prefix, so 999.7 becomes "1.00 k" not "1000".
  const rounded = Number(value.toPrecision(digits));
  let exp3 = Math.floor(Math.log10(Math.abs(rounded)) / 3) * 3;
  const lo = PREFIXES[0][0];
  const hi = PREFIXES[PREFIXES.length - 1][0];
  if (exp3 < lo || exp3 > hi) {
    // Outside f..T: plain scientific notation.
    const t = rounded.toExponential(digits - 1);
    return join(local(trim ? t.replace(/\.?0+e/, "e") : t), "", symbol);
  }
  exp3 = Math.max(lo, Math.min(hi, exp3));
  const prefix = PREFIXES.find(([e]) => e === exp3)![1];
  const m = rounded / 10 ** exp3;
  return join(local(mantissa(m, digits, trim)), prefix, symbol);
}
