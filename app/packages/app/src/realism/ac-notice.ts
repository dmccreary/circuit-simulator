// ANI-08: when the current reverses too fast to follow at the present
// simulation speed, offer to slow down to about two seconds per cycle.

import type { CircuitDocument } from "@cs/model";

/** Parts whose `frequency` prop drives alternating current. */
const AC_TYPES = new Set(["ac-source", "square-source", "waveform-source", "clock"]);

/** The highest source frequency in the circuit, Hz (0 when none). */
export function highestFrequency(doc: CircuitDocument): number {
  let f = 0;
  for (const p of Object.values(doc.parts)) {
    const v = p.props.frequency;
    if (AC_TYPES.has(p.type) && typeof v === "number" && v > f) f = v;
  }
  return f;
}

/** Current reversals per real second at `speed` simulated seconds per real second. */
export const reversalsPerSecond = (f: number, speed: number): number => 2 * f * speed;

/** Above this many reversals per real second the motion cannot be followed. */
export const MAX_VISIBLE_REVERSALS = 5;

/** A speed from `choices` at which one cycle takes about two real seconds (nearest on a log scale). */
export function slowSpeedFor(f: number, choices: readonly number[]): number {
  const target = 1 / (2 * f);
  let best = choices[0];
  for (const c of choices) if (Math.abs(Math.log(c / target)) < Math.abs(Math.log(best / target))) best = c;
  return best;
}
