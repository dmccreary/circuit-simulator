// Failure as a document fact (Overview §3.3 note, RLM-07): a failed part has a
// `failed` prop, so Reset keeps it on screen, and Repair is an ordinary,
// undoable edit that removes it. Undo of the failure itself also repairs.

import type { CircuitDocument, Patch } from "@cs/model";
import { FAILED_PROP, failedMode } from "@cs/elements";

/** Ids of failed parts. */
export function failedParts(doc: CircuitDocument): string[] {
  return Object.values(doc.parts)
    .filter((p) => failedMode(p.props))
    .map((p) => p.id);
}

/** Record a failure (inside an edit recipe). */
export function markFailed(draft: CircuitDocument, partId: string, mode: "open" | "short"): boolean {
  const p = draft.parts[partId];
  if (!p || p.props[FAILED_PROP] === mode) return false;
  p.props[FAILED_PROP] = mode;
  return true;
}

/** Repair these parts, or every failed part (inside an edit recipe). Returns how many were repaired. */
export function repairParts(draft: CircuitDocument, ids?: readonly string[]): number {
  let n = 0;
  for (const id of ids ?? Object.keys(draft.parts)) {
    const p = draft.parts[id];
    if (!p || !(FAILED_PROP in p.props)) continue;
    delete p.props[FAILED_PROP];
    n++;
  }
  return n;
}

/**
 * Parts whose failure was cleared by these patches (a deleted or emptied
 * `failed` prop). Prop deletions do not reach the engine through the normal
 * parameter path, so the realism session forwards them.
 */
export function repairedByPatches(patches: readonly Patch[]): string[] {
  const out: string[] = [];
  for (const p of patches) {
    const [root, id, field, key] = p.path;
    if (root !== "parts" || field !== "props" || typeof id !== "string") continue;
    if (key === FAILED_PROP && (p.op === "delete" || (p.op === "set" && !failedMode({ failed: p.value as string })))) out.push(id);
  }
  return out;
}
