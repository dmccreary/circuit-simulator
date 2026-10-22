// The LinearSolver seam (simulation-engine.md §3). Dense LU now; a sparse
// Markowitz solver for large circuits can replace it behind the same interface.

export interface SparsityPattern {
  size: number;
  /** Optional row-major nonzero flags (size * size); dense solvers ignore it. */
  nonzeros?: Uint8Array;
}

export interface LinearSolver {
  /** Called when the topology changes: decide the pivot order and fill-in. */
  analyze(pattern: SparsityPattern): void;
  /** Factor row-major values (size * size). Throws SingularError with the failing row. */
  factor(values: Float64Array): void;
  /** Solve in place using the latest factorization. */
  solve(rhs: Float64Array): void;
}

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
