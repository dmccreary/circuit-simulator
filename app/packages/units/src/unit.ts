/** Must stay structurally identical to `Unit` in @cs/elements (api.ts); units cannot import it (cycle). */
export type Unit = "ohm" | "F" | "H" | "V" | "A" | "W" | "Hz" | "s" | "%" | "°C" | "";

/** Display symbol for each unit. */
export const UNIT_SYMBOL: Record<Unit, string> = {
  ohm: "Ω",
  F: "F",
  H: "H",
  V: "V",
  A: "A",
  W: "W",
  Hz: "Hz",
  s: "s",
  "%": "%",
  "°C": "°C",
  "": "",
};

/** Spellings accepted after a number. Matched case-sensitively unless listed in lower case under `ci`. */
export const UNIT_SPELLINGS: Record<Exclude<Unit, "">, { exact: string[]; ci?: string[] }> = {
  ohm: { exact: ["Ω", "Ω"], ci: ["ohm", "ohms"] }, // U+03A9 and U+2126
  F: { exact: ["F"] },
  H: { exact: ["H"] },
  V: { exact: ["V"] },
  A: { exact: ["A"] },
  W: { exact: ["W"] },
  Hz: { exact: ["Hz"], ci: ["hz"] },
  s: { exact: ["s"], ci: ["sec"] },
  "%": { exact: ["%"] },
  "°C": { exact: ["°C", "C"] },
};

/** Units that never take an SI prefix when displayed. */
export const UNPREFIXED: ReadonlySet<Unit> = new Set<Unit>(["%", "°C", ""]);

/** Identify a unit suffix, or undefined if it is not a known unit spelling. */
export function matchUnit(text: string): Unit | undefined {
  const lower = text.toLowerCase();
  for (const [unit, sp] of Object.entries(UNIT_SPELLINGS) as [Unit, { exact: string[]; ci?: string[] }][]) {
    if (sp.exact.includes(text)) return unit;
    if (sp.ci?.includes(lower)) return unit;
  }
  return undefined;
}
