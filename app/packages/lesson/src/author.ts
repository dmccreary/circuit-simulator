// Author mode, first piece (§4.6, LES-15): turn the live circuit into a step
// that checks it, so a lesson writer can paste it into a lesson file.

import { stringify } from "yaml";
import type { CircuitDocument } from "@cs/model";

/**
 * A `do` step whose check holds for the selected parts as they are now: each
 * part exists and each numeric or boolean property has its current value.
 * With nothing selected, every part is included.
 */
export function stepSnapshotYaml(doc: CircuitDocument, selection: readonly string[] = []): string {
  const ids = selection.filter((id) => doc.parts[id]);
  const parts = (ids.length ? ids : Object.keys(doc.parts)).map((id) => doc.parts[id]).filter((p) => p.label);
  const checks: unknown[] = [];
  for (const p of parts) {
    checks.push({ part: { type: p.type, label: p.label } });
    for (const [prop, v] of Object.entries(p.props)) {
      if (prop === "closed" || prop === "pressed") checks.push({ switch: { part: p.label, closed: !!v } });
      else if (typeof v === "number") checks.push({ property: { part: p.label, prop, equals: v, tolerance: "1%" } });
    }
  }
  const step = [{ do: { prompt: "Describe what the learner should change.", check: checks.length === 1 ? checks[0] : { all: checks } } }];
  return stringify(step, { lineWidth: 0 });
}
