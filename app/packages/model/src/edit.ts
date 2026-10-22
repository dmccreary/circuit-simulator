// Edit and undo system (design/circuit-model.md §3).
//
// Every emitted PatchBatch is a delta from the document as of the previous
// batch, so a listener that applies every batch in order stays in sync:
//   - update(): provisional batch with that update's patches;
//   - commit(): non-provisional batch with what normalization changed (possibly
//     empty), marking the end of the gesture;
//   - cancel(): non-provisional batch reverting all provisional patches;
//   - undo/redo: the recorded net change (or its inverse);
//   - load(): a single root replacement (path []).
import { applyPatches, diff } from "./patches";
import { produce } from "./produce";
import type { CircuitDocument, MessageRef, Patch, PatchBatch, Unsubscribe } from "./types";

export interface Transaction {
  update(recipe: (draft: CircuitDocument) => void): void;
  commit(): void;
  cancel(): void;
  readonly open: boolean;
}

export interface EditSystem {
  readonly doc: CircuitDocument;
  /** Start a gesture. Edits made until commit or cancel become one undo step (EDT-32). */
  begin(label: MessageRef, options?: { coalesceKey?: string }): Transaction;
  /** Convenience: begin, one update, commit. */
  edit(label: MessageRef, recipe: (draft: CircuitDocument) => void, options?: { coalesceKey?: string }): void;
  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  onPatches(listener: (p: PatchBatch) => void): Unsubscribe;
  /** Replace the document and clear undo history. */
  load(doc: CircuitDocument): void;
}

export interface EditSystemOptions {
  /** Runs inside every commit, so its changes join the undo step. */
  normalize?: (draft: CircuitDocument) => void;
}

interface UndoEntry {
  label: MessageRef;
  before: CircuitDocument;
  patches: Patch[];
  inverse: Patch[];
  coalesceKey?: string;
}

export function createEditSystem(initial: CircuitDocument, opts: EditSystemOptions = {}): EditSystem {
  let doc = initial;
  let undoStack: UndoEntry[] = [];
  let redoStack: UndoEntry[] = [];
  let active: Transaction | null = null;
  // Coalescing only applies to directly consecutive commits.
  let coalesceOpen = false;
  const listeners = new Set<(p: PatchBatch) => void>();

  const emit = (batch: PatchBatch) => {
    for (const l of [...listeners]) l(batch);
  };

  const closeActive = () => {
    if (active?.open) active.cancel();
  };

  const sys: EditSystem = {
    get doc() {
      return doc;
    },
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },

    begin(label, options = {}) {
      if (active?.open) throw new Error("EditSystem: a transaction is already open");
      const start = doc;
      let open = true;
      let touched = false;
      const tx: Transaction = {
        get open() {
          return open;
        },
        update(recipe) {
          if (!open) throw new Error("Transaction is closed");
          const r = produce(doc, recipe);
          if (r.patches.length === 0) return;
          touched = true;
          doc = r.doc;
          emit({ patches: r.patches, provisional: true, source: "edit", label });
        },
        commit() {
          if (!open) return;
          open = false;
          active = null;
          if (!touched) return;
          let tail: Patch[] = [];
          if (opts.normalize) {
            let r;
            try {
              r = produce(doc, opts.normalize);
            } catch (e) {
              // Never leave listeners on a half-finished gesture.
              const patches = diff(doc, start);
              doc = start;
              emit({ patches, provisional: false, source: "cancel", label });
              throw e;
            }
            doc = r.doc;
            tail = r.patches;
          }
          const top = undoStack[undoStack.length - 1];
          const key = options.coalesceKey;
          if (key !== undefined && coalesceOpen && top?.coalesceKey === key) {
            top.patches = diff(top.before, doc);
            top.inverse = diff(doc, top.before);
            if (top.patches.length === 0) undoStack.pop();
          } else {
            const patches = diff(start, doc);
            if (patches.length > 0) {
              undoStack.push({ label, before: start, patches, inverse: diff(doc, start), coalesceKey: key });
            }
          }
          coalesceOpen = key !== undefined;
          redoStack = [];
          emit({ patches: tail, provisional: false, source: "edit", label });
        },
        cancel() {
          if (!open) return;
          open = false;
          active = null;
          if (!touched) return;
          const patches = diff(doc, start);
          doc = start;
          emit({ patches, provisional: false, source: "cancel", label });
        },
      };
      active = tx;
      return tx;
    },

    edit(label, recipe, options) {
      const tx = sys.begin(label, options);
      try {
        tx.update(recipe);
        tx.commit();
      } catch (e) {
        tx.cancel();
        throw e;
      }
    },

    undo() {
      closeActive();
      const e = undoStack.pop();
      if (!e) return;
      doc = applyPatches(doc, e.inverse);
      redoStack.push(e);
      coalesceOpen = false;
      emit({ patches: e.inverse, provisional: false, source: "undo", label: e.label });
    },

    redo() {
      closeActive();
      const e = redoStack.pop();
      if (!e) return;
      doc = applyPatches(doc, e.patches);
      // After a redo, `before` must match the document the entry starts from.
      e.before = applyPatches(doc, e.inverse);
      undoStack.push(e);
      coalesceOpen = false;
      emit({ patches: e.patches, provisional: false, source: "redo", label: e.label });
    },

    onPatches(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    load(next) {
      closeActive();
      doc = next;
      undoStack = [];
      redoStack = [];
      coalesceOpen = false;
      emit({ patches: [{ op: "set", path: [], value: next }], provisional: false, source: "load" });
    },
  };
  return sys;
}
