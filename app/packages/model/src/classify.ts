// Decide how much work a patch batch needs (design/circuit-model.md §4.2).
import type { CircuitDocument, Patch, PropValue } from "./types";

export type ChangeKind = "none" | "params" | "topology";

const RANK: Record<ChangeKind, number> = { none: 0, params: 1, topology: 2 };

// Part fields that never reach the netlist.
const COSMETIC_PART_FIELDS = new Set(["label", "labelOffset", "locked", "savedState"]);
// Probe fields that do not change which channel is recorded.
const COSMETIC_PROBE_FIELDS = new Set(["name", "style", "lane", "flag", "measurements"]);
const COSMETIC_ROOTS = new Set(["formatVersion", "meta", "view", "annotations", "lanes", "mathTraces", "sliders", "analyses"]);

function classifyOne(p: Patch): ChangeKind {
  const [root, , field, sub] = p.path;
  if (p.path.length === 0) return "topology";
  if (typeof root !== "string" || COSMETIC_ROOTS.has(root)) return "none";
  if (root === "parts") {
    if (field === undefined) return "topology"; // part added, removed or replaced
    if (COSMETIC_PART_FIELDS.has(String(field))) return "none";
    // Switch state is a prop too: the engine models switches as resistances.
    if (field === "props") return sub === "definition" || (sub === undefined && p.op === "delete") ? "topology" : "params";
    return "topology"; // at, orientation, length, type
  }
  if (root === "probes") {
    if (field === undefined) return "topology";
    return COSMETIC_PROBE_FIELDS.has(String(field)) ? "none" : "topology";
  }
  // wires, netLabels, subcircuits, settings, and anything unknown.
  return "topology";
}

export function classify(patches: readonly Patch[]): ChangeKind {
  let best: ChangeKind = "none";
  for (const p of patches) {
    const k = classifyOne(p);
    if (RANK[k] > RANK[best]) best = k;
    if (best === "topology") break;
  }
  return best;
}

export interface ParamChange {
  element: string;
  param: string;
  value: PropValue;
}

/** Prop changes in a "params" batch, read from the patched document. Last write wins. */
export function paramChanges(patches: readonly Patch[], doc: CircuitDocument): ParamChange[] {
  const out = new Map<string, ParamChange>();
  for (const p of patches) {
    const [root, id, field, key] = p.path;
    if (root !== "parts" || field !== "props" || typeof id !== "string") continue;
    const props = doc.parts[id]?.props;
    if (!props) continue;
    const keys = key === undefined ? Object.keys(props) : [String(key)];
    for (const k of keys) {
      const value = props[k];
      if (value === undefined) continue;
      out.delete(`${id}\u0000${k}`);
      out.set(`${id}\u0000${k}`, { element: id, param: k, value });
    }
  }
  return [...out.values()];
}
