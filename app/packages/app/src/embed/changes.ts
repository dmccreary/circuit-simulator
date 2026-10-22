import { diff, type CircuitDocument, type EditSystem, type MessageRef, type Patch, type PatchBatch } from "@cs/model";

/** One finished change to the document: a committed gesture, an undo or redo, or a load. */
export interface CommittedChange {
  /** Net change from `before` to `after` (a commit batch alone holds only normalization patches). */
  patches: Patch[];
  before: CircuitDocument;
  after: CircuitDocument;
  source: PatchBatch["source"];
  label?: MessageRef;
}

/**
 * Calls `fn` once per finished change, skipping live-drag (provisional)
 * batches, so a slider drag or part move is seen exactly once, when it ends.
 */
export function trackChanges(edits: Pick<EditSystem, "doc" | "onPatches">, fn: (c: CommittedChange) => void): () => void {
  let before = edits.doc;
  return edits.onPatches((batch) => {
    if (batch.provisional) return;
    const after = edits.doc;
    const prev = before;
    before = after;
    if (batch.source === "cancel") return;
    const patches = batch.source === "load" ? batch.patches : diff(prev, after);
    if (patches.length) fn({ patches, before: prev, after, source: batch.source, label: batch.label });
  });
}
