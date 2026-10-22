// Sources carry `acMagnitude` and `acPhase` for the Frequency tab (ANL-08,
// ANL-16). The Inspector shows them under an "AC analysis" heading.

import type { PropSpec } from "@cs/elements";

export const AC_KEYS = new Set(["acMagnitude", "acPhase"]);
/** Sentinel spec the Inspector renders as the heading. */
export const AC_HEADING = "__acHeading";

/** Props with the AC ones moved last, after a heading sentinel. */
export function orderedProps(props: readonly PropSpec[]): PropSpec[] {
  const ac = props.filter((p) => AC_KEYS.has(p.key));
  if (ac.length === 0) return [...props];
  return [...props.filter((p) => !AC_KEYS.has(p.key)), { key: AC_HEADING, unit: "", default: 0 }, ...ac];
}
