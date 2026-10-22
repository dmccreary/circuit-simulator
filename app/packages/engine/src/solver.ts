// The LinearSolver seam (simulation-engine.md §3). Dense LU below for small
// systems; SparseLU (sparse-lu.ts) with Markowitz ordering for large ones.
// `createSolver` picks between them by size.

export interface SparsityPattern {
  size: number;
  /** Optional row-major nonzero flags (size * size); dense solvers ignore it. */
  nonzeros?: Uint8Array;
  /**
   * Coordinate layout for "coordinate" solvers: slot k is (rows[k], cols[k]),
   * 0-based, and factor() receives values in slot order. Slots are unique.
   */
  rows?: Int32Array;
  cols?: Int32Array;
  /** Slots in use (rows/cols may be longer). Default rows.length. */
  nnz?: number;
}

export interface LinearSolver {
  /**
   * How factor() expects its values: "dense" (default) is row-major
   * size * size; "coordinate" follows the slot order of the analyzed pattern.
   */
  readonly format?: "dense" | "coordinate";
  /** Called when the topology changes (or, for coordinate solvers, when slots are added). */
  analyze(pattern: SparsityPattern): void;
  /** Factor the values. Throws SingularError with the failing row. */
  factor(values: Float64Array): void;
  /** Solve in place using the latest factorization. */
  solve(rhs: Float64Array): void;
  /** Value-dependent solver state (a pivot order) to keep in engine checkpoints, for exact replay. */
  snapshot?(): unknown;
  restore?(state: unknown): void;
}

/** Below this many unknowns dense LU is faster than sparse (simulation-engine.md §3). */
export const SPARSE_MIN_SIZE = 40;

/** `row` is the 0-based matrix row/column (unknown index - 1) that had no usable pivot. */
export class SingularError extends Error {
  constructor(readonly row: number) {
    super(`singular matrix at row ${row}`);
    this.name = "SingularError";
  }
}

/** Pivots smaller than this fraction of their column's largest original entry count as zero. */
const PIVOT_REL = 1e-14;

export class DenseLU implements LinearSolver {
  private n = 0;
  private lu = new Float64Array(0);
  private piv = new Int32Array(0);
  private colMax = new Float64Array(0);

  analyze(pattern: SparsityPattern): void {
    this.n = pattern.size;
    this.lu = new Float64Array(this.n * this.n);
    this.piv = new Int32Array(this.n);
    this.colMax = new Float64Array(this.n);
  }

  factor(values: Float64Array): void {
    const { n, lu, piv, colMax } = this;
    lu.set(values.subarray(0, n * n));
    colMax.fill(0);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const a = Math.abs(lu[i * n + j]);
        if (a > colMax[j]) colMax[j] = a;
      }
    for (let k = 0; k < n; k++) {
      let p = k;
      let max = Math.abs(lu[k * n + k]);
      for (let i = k + 1; i < n; i++) {
        const a = Math.abs(lu[i * n + k]);
        if (a > max) {
          max = a;
          p = i;
        }
      }
      if (!(max > PIVOT_REL * colMax[k]) || max === 0) throw new SingularError(k);
      piv[k] = p;
      if (p !== k) {
        for (let j = 0; j < n; j++) {
          const t = lu[k * n + j];
          lu[k * n + j] = lu[p * n + j];
          lu[p * n + j] = t;
        }
      }
      const pivot = lu[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = lu[i * n + k] / pivot;
        lu[i * n + k] = f;
        if (f !== 0) for (let j = k + 1; j < n; j++) lu[i * n + j] -= f * lu[k * n + j];
      }
    }
  }

  solve(b: Float64Array): void {
    const { n, lu, piv } = this;
    for (let k = 0; k < n; k++) {
      const p = piv[k];
      if (p !== k) {
        const t = b[k];
        b[k] = b[p];
        b[p] = t;
      }
    }
    for (let i = 1; i < n; i++) {
      let s = b[i];
      for (let j = 0; j < i; j++) s -= lu[i * n + j] * b[j];
      b[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= lu[i * n + j] * b[j];
      b[i] = s / lu[i * n + i];
    }
  }
}
