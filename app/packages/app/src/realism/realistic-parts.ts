// Realistic parts (RLM-01): switching the circuit setting swaps every part's
// props that still hold the other mode's default (shared/realistic.ts), inside
// the same undo step as the setting itself.

import type { CircuitDocument } from "@cs/model";
import { getDescriptor, realisticChanges } from "@cs/elements";

/** Apply inside an edit recipe, together with the settings change. */
export function applyRealisticParts(draft: CircuitDocument, realistic: boolean): void {
  for (const part of Object.values(draft.parts)) {
    const d = getDescriptor(part.type);
    if (!d) continue;
    const changes = realisticChanges(d, part.props, realistic);
    for (const [k, v] of Object.entries(changes)) part.props[k] = v;
  }
}
