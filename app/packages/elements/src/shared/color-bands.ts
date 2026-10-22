// Resistor color code (IEC 60062) for the lifelike view (CAN-14): two
// significant digits, a multiplier and a tolerance band.

export const BAND_NAMES = ["black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "grey", "white"] as const;

export type BandName = (typeof BAND_NAMES)[number] | "gold" | "silver";

/** Paint colors for drawing the bands. */
export const BAND_CSS: Record<BandName, string> = {
  black: "#1a1a1a",
  brown: "#7b4a1e",
  red: "#d32f2f",
  orange: "#f57c00",
  yellow: "#fdd835",
  green: "#2e7d32",
  blue: "#1565c0",
  violet: "#7b1fa2",
  grey: "#8d8d8d",
  white: "#f5f5f5",
  gold: "#c9a227",
  silver: "#b8bec4",
};

/**
 * The four bands for a resistance in ohms: digit, digit, multiplier, tolerance
 * (gold, 5%). 4.7 kΩ gives yellow, violet, red, gold. Values outside the
 * code's range (below 0.1 Ω or above 99 GΩ) are clamped to it.
 */
export function colorBands(ohms: number): BandName[] {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return ["black", "black", "black", "gold"];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / Math.pow(10, exp));
  if (sig >= 100) {
    sig = Math.round(sig / 10);
    exp++;
  }
  if (exp < -2) {
    exp = -2;
    sig = Math.max(1, Math.round(ohms * 100));
  }
  if (exp > 9) {
    exp = 9;
    sig = 99;
  }
  sig = Math.min(99, sig);
  const mult: BandName = exp === -2 ? "silver" : exp === -1 ? "gold" : BAND_NAMES[exp];
  return [BAND_NAMES[Math.floor(sig / 10)], BAND_NAMES[sig % 10], mult, "gold"];
}
