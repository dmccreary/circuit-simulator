// Logic lane values (rendering.md §5.6, DIG-07): low, high, unknown (X,
// drawn hatched) and high impedance (Z, drawn at mid level).

export type LogicLevel = 0 | 1 | "x" | "z";

/**
 * Decoding of a logic channel's samples, matching the engine's encoding
 * (engine digital/types.ts logicSample): 0 low, 1 high, 0.5 unknown (X),
 * NaN high impedance (Z). Other values are voltages from nets without
 * digital pins and are thresholded at `threshold` volts.
 */
export const LOGIC_X = 0.5;

export function logicLevel(v: number, threshold = 2.5): LogicLevel {
  if (Number.isNaN(v)) return "z";
  if (v === LOGIC_X) return "x";
  if (v === 0) return 0;
  if (v === 1) return 1;
  return v >= threshold ? 1 : 0;
}

/**
 * One pixel column of a logic trace, from the bucket's min and max. A column
 * with no finite samples is "empty": Z once the trace has started, nothing
 * before (the history store also uses NaN for "no data").
 */
export type LogicColumn = { kind: "level"; level: LogicLevel } | { kind: "edge" } | { kind: "empty" };

export function logicColumn(min: number, max: number, threshold = 2.5): LogicColumn {
  if (Number.isNaN(min) || Number.isNaN(max)) return { kind: "empty" };
  const a = logicLevel(min, threshold);
  const b = logicLevel(max, threshold);
  if (a === "x" || b === "x") return { kind: "level", level: "x" };
  if (a === b) return { kind: "level", level: a };
  return { kind: "edge" };
}
