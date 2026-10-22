import type { CircuitDocument, CompiledCircuit, EditSystem, MessageRef, Transaction } from "@cs/model";

/**
 * How the controller shows and edits a nested sheet (a subcircuit definition,
 * EDT-36) while the whole circuit keeps simulating. See ./lens.ts.
 */
export interface SheetHooks {
  /** The definition as a document the canvas and tools work on; undefined if it is gone. */
  view(doc: CircuitDocument): CircuitDocument | undefined;
  /** The compiled circuit re-keyed to the definition's own ids and points. */
  compiled(doc: CircuitDocument, compiled: CompiledCircuit | undefined): CompiledCircuit | undefined;
  /** A transaction whose recipes run on the view and land in the definition. */
  begin(edits: EditSystem, label: MessageRef, options?: { coalesceKey?: string }): Transaction;
}
