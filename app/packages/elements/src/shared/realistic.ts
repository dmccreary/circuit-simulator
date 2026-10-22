// Realistic parts (RLM-01): props with a `realisticDefault` take it when the
// circuit setting is on. Values the student set by hand are left alone: only a
// value still equal to the other mode's default is swapped, so turning the
// setting off again restores the ideal values exactly.

import type { PropValue } from "@cs/model";
import type { ElementDescriptor } from "../api";

/** Props for a new part of this type. */
export function defaultPropsFor(d: ElementDescriptor, realistic: boolean): Record<string, PropValue> {
  return Object.fromEntries(d.props.map((p) => [p.key, realistic && p.realisticDefault !== undefined ? p.realisticDefault : p.default]));
}

/**
 * The prop changes that move an existing part into (or out of) realistic mode,
 * or an empty object when nothing changes.
 */
export function realisticChanges(d: ElementDescriptor, props: Record<string, PropValue>, realistic: boolean): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const p of d.props) {
    if (p.realisticDefault === undefined) continue;
    const from = realistic ? p.default : p.realisticDefault;
    const to = realistic ? p.realisticDefault : p.default;
    const v = props[p.key];
    if (v === undefined || v === from) out[p.key] = to;
  }
  return out;
}

/** Part types with at least one realistic default. */
export function hasRealisticProps(d: ElementDescriptor): boolean {
  return d.props.some((p) => p.realisticDefault !== undefined);
}
