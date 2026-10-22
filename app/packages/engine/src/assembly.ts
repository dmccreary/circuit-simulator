// MNA assembly: a matrix A and right-hand side b that element models stamp
// into through the Stamper contract. Unknown u (1-based; 0 = ground) lives at
// matrix row/column u - 1.
//
// Two storages behind one `Assembly` interface: MnaSystem keeps A dense
// (row-major, small circuits), SparseMnaSystem keeps one value per structural
// entry (slot) for the sparse solver. Both add stamps to an entry in the same
// order, so A's values are bit-identical between them.
//
// Restamping: stamps made between beginStatic() and endStatic() are kept as
// the static part; begin() restores it, so each step only re-adds the
// per-step and Newton stamps (simulation-engine.md §3).

import type { NodeIndex } from "@cs/model";
import type { Stamper, UnknownIndex } from "@cs/elements";
import type { SparsityPattern } from "./solver";

export interface Assembly extends Stamper {
  readonly size: number;
  readonly b: Float64Array;
  /** The matrix values in the solver's format (dense row-major, or slot order). */
  values(): Float64Array;
  /** Bumped whenever the structure changes (a slot is added). */
  readonly patternVersion: number;
  pattern(): SparsityPattern;
  beginStatic(): void;
  endStatic(): void;
  begin(): void;
  addNodeShunt(nodeCount: number, g: number): void;
}

export class MnaSystem implements Assembly {
  readonly patternVersion = 0;
  readonly A: Float64Array;
  readonly b: Float64Array;
  private readonly staticA: Float64Array;
  private readonly staticB: Float64Array;

  constructor(readonly size: number) {
    this.A = new Float64Array(size * size);
    this.b = new Float64Array(size);
    this.staticA = new Float64Array(size * size);
    this.staticB = new Float64Array(size);
  }

  values(): Float64Array {
    return this.A;
  }

  pattern(): SparsityPattern {
    return { size: this.size };
  }

  matrix(row: UnknownIndex, col: UnknownIndex, value: number): void {
    if (row === 0 || col === 0) return;
    this.A[(row - 1) * this.size + (col - 1)] += value;
  }

  rhs(row: UnknownIndex, value: number): void {
    if (row === 0) return;
    this.b[row - 1] += value;
  }

  conductance(a: NodeIndex, b: NodeIndex, g: number): void {
    this.matrix(a, a, g);
    this.matrix(b, b, g);
    this.matrix(a, b, -g);
    this.matrix(b, a, -g);
  }

  current(a: NodeIndex, b: NodeIndex, i: number): void {
    this.rhs(a, -i);
    this.rhs(b, i);
  }

  voltageSource(branch: UnknownIndex, plus: NodeIndex, minus: NodeIndex, v: number): void {
    this.matrix(plus, branch, 1);
    this.matrix(minus, branch, -1);
    this.matrix(branch, plus, 1);
    this.matrix(branch, minus, -1);
    this.rhs(branch, v);
  }

  /** Clear A and b; the following stamps become the static part. */
  beginStatic(): void {
    this.A.fill(0);
    this.b.fill(0);
  }

  endStatic(): void {
    this.staticA.set(this.A);
    this.staticB.set(this.b);
  }

  /** Reset A and b to the static part, ready for per-step stamps. */
  begin(): void {
    this.A.set(this.staticA);
    this.b.set(this.staticB);
  }

  /** Add g from every node (unknowns 1..nodeCount) to ground. */
  addNodeShunt(nodeCount: number, g: number): void {
    if (g === 0) return;
    for (let u = 1; u <= nodeCount; u++) this.A[(u - 1) * this.size + (u - 1)] += g;
  }
}

/** Coordinate storage: one value per structural entry, found by a short per-row scan. */
export class SparseMnaSystem implements Assembly {
  readonly b: Float64Array;
  private readonly staticB: Float64Array;
  patternVersion = 0;
  private nnz = 0;
  private vals = new Float64Array(64);
  private staticVals = new Float64Array(64);
  private slotRow = new Int32Array(64);
  private slotCol = new Int32Array(64);
  /** Per row: the columns present and their slots, in insertion order. */
  private readonly rowCols: number[][];
  private readonly rowSlots: number[][];

  constructor(readonly size: number, diagonals = 0) {
    this.b = new Float64Array(size);
    this.staticB = new Float64Array(size);
    this.rowCols = Array.from({ length: size }, () => []);
    this.rowSlots = Array.from({ length: size }, () => []);
    // Node diagonals always exist (gmin, shunts), so create them up front.
    for (let u = 1; u <= Math.min(diagonals, size); u++) this.slot(u - 1, u - 1);
  }

  private slot(r: number, c: number): number {
    const cs = this.rowCols[r];
    for (let i = 0; i < cs.length; i++) if (cs[i] === c) return this.rowSlots[r][i];
    const s = this.nnz++;
    if (s >= this.vals.length) this.grow();
    this.slotRow[s] = r;
    this.slotCol[s] = c;
    cs.push(c);
    this.rowSlots[r].push(s);
    this.patternVersion++;
    return s;
  }

  private grow(): void {
    const cap = this.vals.length * 2;
    const g64 = (a: Float64Array) => {
      const out = new Float64Array(cap);
      out.set(a);
      return out;
    };
    const g32 = (a: Int32Array) => {
      const out = new Int32Array(cap);
      out.set(a);
      return out;
    };
    this.vals = g64(this.vals);
    this.staticVals = g64(this.staticVals);
    this.slotRow = g32(this.slotRow);
    this.slotCol = g32(this.slotCol);
  }

  values(): Float64Array {
    return this.vals.subarray(0, this.nnz);
  }

  pattern(): SparsityPattern {
    return { size: this.size, rows: this.slotRow.subarray(0, this.nnz), cols: this.slotCol.subarray(0, this.nnz), nnz: this.nnz };
  }

  /** Value at (row, col) in unknown numbering; 0 when the entry is absent. */
  get(row: UnknownIndex, col: UnknownIndex): number {
    const cs = this.rowCols[row - 1];
    for (let i = 0; i < cs.length; i++) if (cs[i] === col - 1) return this.vals[this.rowSlots[row - 1][i]];
    return 0;
  }

  matrix(row: UnknownIndex, col: UnknownIndex, value: number): void {
    if (row === 0 || col === 0) return;
    const s = this.slot(row - 1, col - 1); // may grow (replace) this.vals
    this.vals[s] += value;
  }

  rhs(row: UnknownIndex, value: number): void {
    if (row === 0) return;
    this.b[row - 1] += value;
  }

  conductance(a: NodeIndex, b: NodeIndex, g: number): void {
    this.matrix(a, a, g);
    this.matrix(b, b, g);
    this.matrix(a, b, -g);
    this.matrix(b, a, -g);
  }

  current(a: NodeIndex, b: NodeIndex, i: number): void {
    this.rhs(a, -i);
    this.rhs(b, i);
  }

  voltageSource(branch: UnknownIndex, plus: NodeIndex, minus: NodeIndex, v: number): void {
    this.matrix(plus, branch, 1);
    this.matrix(minus, branch, -1);
    this.matrix(branch, plus, 1);
    this.matrix(branch, minus, -1);
    this.rhs(branch, v);
  }

  beginStatic(): void {
    this.vals.fill(0);
    this.b.fill(0);
  }

  endStatic(): void {
    this.staticVals.set(this.vals);
    this.staticB.set(this.b);
  }

  begin(): void {
    // Slots added after endStatic() are zero in staticVals.
    this.vals.set(this.staticVals.subarray(0, this.nnz));
    this.b.set(this.staticB);
  }

  addNodeShunt(nodeCount: number, g: number): void {
    if (g === 0) return;
    for (let u = 1; u <= nodeCount; u++) {
      const s = this.slot(u - 1, u - 1);
      this.vals[s] += g;
    }
  }
}
