import type { ReadoutSpec, TerminalSpec } from "../api";

/** Default and minimum length of stretchable two-terminal parts, grid units. */
export const DEFAULT_LENGTH = 4;
export const STRETCH = { min: 2, default: DEFAULT_LENGTH } as const;

export function twoTerminals(first = "1", second = "2"): TerminalSpec[] {
  return [
    { name: first, at: { x: 0, y: 0 } },
    { name: second, at: { x: DEFAULT_LENGTH, y: 0 } },
  ];
}

/** Voltage across, current through, power (CMP-04). */
export const VIP: ReadoutSpec[] = [
  { key: "voltage", unit: "V" },
  { key: "current", unit: "A" },
  { key: "power", unit: "W" },
];
