// Sparse LU for large circuits (simulation-engine.md §3), KLU/Sparse-1.3 style.
//
// The matrix arrives in coordinate form: `analyze` gives the slot layout
// (slot k = row rows[k], column cols[k]) and `factor` the values in slot order.
//
// Ordering. The first factorization runs a Markowitz search with threshold
// pivoting on the actual values: at each step it picks the entry that
// minimizes (row count - 1)(column count - 1) among entries at least
// THRESHOLD times the largest active entry of their column. The resulting
// pivot sequence and fill-in are compiled into flat index arrays (an
// `Ordering`), which every later factorization replays with no searching.
//
// Refactorization reuses the ordering while its pivots stay acceptable. If a
// pivot drops below REFACTOR_THRESHOLD of its column (values drifted, say a
// diode switched off) the matrix is re-ordered from scratch. A new pattern
// slot is ignored while its value is zero; a nonzero one forces a re-order.
//
// Determinism. The ordering depends on the values it was computed from, so
// the engine checkpoints it (`snapshot`/`restore`): a replay from a
// checkpoint then factors with exactly the pivots the original run used.

import { SingularError, type LinearSolver, type SparsityPattern } from "./solver";

/** Markowitz candidates must be at least this fraction of their column's largest active entry. */
const THRESHOLD = 1e-3;
/** A reused pivot below this fraction of its column forces a re-order. */
const REFACTOR_THRESHOLD = 1e-6;
/** Same absolute test as DenseLU: pivots below this fraction of the column's largest original entry are zero. */
const PIVOT_REL = 1e-14;

/** A compiled pivot sequence and fill pattern. Immutable once built. */
interface Ordering {
  n: number;
  /** Pattern slots covered (slots at or beyond this index must be zero). */
  nnzA: number;
  /** Pattern slot -> index into the LU value array. */
  aMap: Int32Array;
  luSize: number;
  /** Original row and column eliminated at each step. */
  stepRow: Int32Array;
  stepCol: Int32Array;
  /** LU index of each step's pivot. */
  pivot: Int32Array;
  /** Column k of L (below the pivot): LU indices and the step of each entry's row. */
  lPtr: Int32Array;
  lIdx: Int32Array;
  lStep: Int32Array;
  /** Row k of U (right of the pivot): LU indices and the step of each entry's column. */
  uPtr: Int32Array;
  uIdx: Int32Array;
  uStep: Int32Array;
  /** For each step, for each L entry, for each U entry: the LU index updated. */
  ops: Int32Array;
}

export class SparseLU implements LinearSolver {
  readonly format = "coordinate" as const;
  private n = 0;
  private rows = new Int32Array(0);
  private cols = new Int32Array(0);
  private nnz = 0;
  private ord: Ordering | null = null;
  private lu = new Float64Array(0);
  private y = new Float64Array(0);
  private colMax = new Float64Array(0);
  /** Full re-orders so far (for tests and profiling). */
  reorders = 0;

  analyze(pattern: SparsityPattern): void {
    const n = pattern.size;
    if (n !== this.n) this.ord = null;
    this.n = n;
    if (pattern.rows && pattern.cols) {
      this.nnz = pattern.nnz ?? pattern.rows.length;
      this.rows = pattern.rows.slice(0, this.nnz);
      this.cols = pattern.cols.slice(0, this.nnz);
    } else {
      // No coordinate pattern: treat the matrix as dense, row-major.
      this.nnz = n * n;
      this.rows = new Int32Array(this.nnz);
      this.cols = new Int32Array(this.nnz);
      for (let k = 0; k < this.nnz; k++) {
        this.rows[k] = Math.floor(k / n);
        this.cols[k] = k % n;
      }
    }
    this.y = new Float64Array(n);
    this.colMax = new Float64Array(n);
  }

  factor(values: Float64Array): void {
    this.columnMax(values);
    let ord = this.ord;
    const reuse = !!ord && this.covers(ord, values);
    if (!ord || !reuse) ord = this.order(values);
    let failed = this.refactor(ord, values);
    if (failed >= 0 && reuse) {
      ord = this.order(values);
      failed = this.refactor(ord, values);
    }
    if (failed >= 0) throw new SingularError(ord.stepCol[failed]);
  }

  solve(b: Float64Array): void {
    const ord = this.ord;
    if (!ord) throw new Error("SparseLU.solve before factor");
    const { n, stepRow, stepCol, pivot, lPtr, lIdx, lStep, uPtr, uIdx, uStep } = ord;
    const { lu, y } = this;
    for (let k = 0; k < n; k++) y[k] = b[stepRow[k]];
    for (let k = 0; k < n; k++) {
      const yk = y[k];
      if (yk === 0) continue;
      for (let t = lPtr[k]; t < lPtr[k + 1]; t++) y[lStep[t]] -= lu[lIdx[t]] * yk;
    }
    for (let k = n - 1; k >= 0; k--) {
      let s = y[k];
      for (let t = uPtr[k]; t < uPtr[k + 1]; t++) s -= lu[uIdx[t]] * y[uStep[t]];
      y[k] = s / lu[pivot[k]];
    }
    for (let k = 0; k < n; k++) b[stepCol[k]] = y[k];
  }

  /** The ordering in effect, for engine checkpoints. */
  snapshot(): unknown {
    return this.ord;
  }

  restore(state: unknown): void {
    const ord = state as Ordering | null;
    this.ord = ord && ord.n === this.n ? ord : null;
    if (this.ord && this.lu.length < this.ord.luSize) this.lu = new Float64Array(this.ord.luSize);
  }

  // ------------------------------------------------------------ numeric refactor

  private columnMax(values: Float64Array): void {
    const { colMax, cols, nnz } = this;
    colMax.fill(0);
    for (let s = 0; s < nnz; s++) {
      const a = Math.abs(values[s]);
      if (a > colMax[cols[s]]) colMax[cols[s]] = a;
    }
  }

  private covers(ord: Ordering, values: Float64Array): boolean {
    for (let s = ord.nnzA; s < this.nnz; s++) if (values[s] !== 0) return false;
    return true;
  }

  /** Factor with a fixed ordering. Returns the failing step, or -1. */
  private refactor(ord: Ordering, values: Float64Array): number {
    const { n, aMap, pivot, stepCol, lPtr, lIdx, uPtr, uIdx, ops } = ord;
    const { lu, colMax } = this;
    lu.fill(0, 0, ord.luSize);
    for (let s = 0; s < ord.nnzA; s++) lu[aMap[s]] = values[s];
    let op = 0;
    for (let k = 0; k < n; k++) {
      const p = lu[pivot[k]];
      const ap = Math.abs(p);
      let m = ap;
      const l0 = lPtr[k];
      const l1 = lPtr[k + 1];
      for (let t = l0; t < l1; t++) {
        const a = Math.abs(lu[lIdx[t]]);
        if (a > m) m = a;
      }
      if (!(ap > PIVOT_REL * colMax[stepCol[k]]) || ap === 0 || ap < REFACTOR_THRESHOLD * m) return k;
      for (let t = l0; t < l1; t++) lu[lIdx[t]] /= p;
      const u0 = uPtr[k];
      const u1 = uPtr[k + 1];
      const width = u1 - u0;
      for (let t = l0; t < l1; t++) {
        const f = lu[lIdx[t]];
        if (f === 0) {
          op += width;
          continue;
        }
        for (let u = u0; u < u1; u++) lu[ops[op++]] -= f * lu[uIdx[u]];
      }
    }
    return -1;
  }

  // ------------------------------------------------------------ Markowitz ordering

  /** Choose pivots on these values and compile the result; becomes the current ordering. */
  private order(values: Float64Array): Ordering {
    this.reorders++;
    const { n, rows, cols, nnz, colMax } = this;
    // Working matrix: active rows as column -> value maps, active columns as row sets.
    const rowMap: Map<number, number>[] = Array.from({ length: n }, () => new Map());
    const colRows: Set<number>[] = Array.from({ length: n }, () => new Set());
    for (let s = 0; s < nnz; s++) {
      const r = rows[s];
      const c = cols[s];
      rowMap[r].set(c, (rowMap[r].get(c) ?? 0) + values[s]);
      colRows[c].add(r);
    }
    const activeCol = new Uint8Array(n).fill(1);
    const activeRow = new Uint8Array(n).fill(1);
    const stepRow = new Int32Array(n);
    const stepCol = new Int32Array(n);
    const lRows: number[][] = [];
    const uCols: number[][] = [];

    for (let k = 0; k < n; k++) {
      let minRow = Infinity;
      for (let r = 0; r < n; r++) if (activeRow[r] && rowMap[r].size < minRow) minRow = rowMap[r].size;
      let pr = -1;
      let pc = -1;
      let bestProd = Infinity;
      let bestMag = 0;
      for (let c = 0; c < n && bestProd > 0; c++) {
        if (!activeCol[c]) continue;
        const set = colRows[c];
        const cnt = set.size;
        if (cnt === 0) continue;
        if ((cnt - 1) * (minRow - 1) >= bestProd) continue;
        let cmax = 0;
        for (const r of set) {
          const a = Math.abs(rowMap[r].get(c)!);
          if (a > cmax) cmax = a;
        }
        const floor = Math.max(THRESHOLD * cmax, PIVOT_REL * colMax[c]);
        for (const r of set) {
          const a = Math.abs(rowMap[r].get(c)!);
          if (!(a > 0) || a < floor || !(a > PIVOT_REL * colMax[c])) continue;
          const prod = (rowMap[r].size - 1) * (cnt - 1);
          if (prod < bestProd || (prod === bestProd && a > bestMag)) {
            bestProd = prod;
            bestMag = a;
            pr = r;
            pc = c;
          }
        }
      }
      if (pr < 0) {
        let bad = -1;
        for (let c = 0; c < n && bad < 0; c++) if (activeCol[c]) bad = c;
        throw new SingularError(bad);
      }

      stepRow[k] = pr;
      stepCol[k] = pc;
      const prow = rowMap[pr];
      const pv = prow.get(pc)!;
      const uList: number[] = [];
      const uVals: number[] = [];
      for (const [j, v] of prow)
        if (j !== pc) {
          uList.push(j);
          uVals.push(v);
        }
      const lList: number[] = [];
      for (const i of colRows[pc]) if (i !== pr) lList.push(i);
      for (const i of lList) {
        const ri = rowMap[i];
        const f = ri.get(pc)! / pv;
        ri.delete(pc);
        for (let t = 0; t < uList.length; t++) {
          const j = uList[t];
          const old = ri.get(j);
          if (old === undefined) {
            ri.set(j, -f * uVals[t]);
            colRows[j].add(i);
          } else ri.set(j, old - f * uVals[t]);
        }
      }
      for (const j of uList) colRows[j].delete(pr);
      colRows[pc].clear();
      prow.clear();
      activeCol[pc] = 0;
      activeRow[pr] = 0;
      lRows.push(lList);
      uCols.push(uList);
    }

    const ord = compile(n, rows, cols, nnz, stepRow, stepCol, lRows, uCols);
    this.ord = ord;
    if (this.lu.length < ord.luSize) this.lu = new Float64Array(ord.luSize);
    return ord;
  }
}

function compile(
  n: number,
  rows: Int32Array,
  cols: Int32Array,
  nnz: number,
  stepRow: Int32Array,
  stepCol: Int32Array,
  lRows: number[][],
  uCols: number[][],
): Ordering {
  const rowStep = new Int32Array(n);
  const colStep = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    rowStep[stepRow[k]] = k;
    colStep[stepCol[k]] = k;
  }
  const slotOf = new Map<number, number>();
  const slot = (r: number, c: number): number => {
    const key = r * n + c;
    let s = slotOf.get(key);
    if (s === undefined) {
      s = slotOf.size;
      slotOf.set(key, s);
    }
    return s;
  };
  const aMap = new Int32Array(nnz);
  for (let s = 0; s < nnz; s++) aMap[s] = slot(rows[s], cols[s]);
  const pivot = new Int32Array(n);
  const lPtr = new Int32Array(n + 1);
  const uPtr = new Int32Array(n + 1);
  let lTotal = 0;
  let uTotal = 0;
  let opTotal = 0;
  for (let k = 0; k < n; k++) {
    lTotal += lRows[k].length;
    uTotal += uCols[k].length;
    opTotal += lRows[k].length * uCols[k].length;
  }
  const lIdx = new Int32Array(lTotal);
  const lStep = new Int32Array(lTotal);
  const uIdx = new Int32Array(uTotal);
  const uStep = new Int32Array(uTotal);
  const ops = new Int32Array(opTotal);
  let li = 0;
  let ui = 0;
  let oi = 0;
  for (let k = 0; k < n; k++) {
    const pr = stepRow[k];
    const pc = stepCol[k];
    pivot[k] = slot(pr, pc);
    lPtr[k] = li;
    uPtr[k] = ui;
    for (const i of lRows[k]) {
      lIdx[li] = slot(i, pc);
      lStep[li++] = rowStep[i];
    }
    for (const j of uCols[k]) {
      uIdx[ui] = slot(pr, j);
      uStep[ui++] = colStep[j];
    }
    for (const i of lRows[k]) for (const j of uCols[k]) ops[oi++] = slot(i, j);
  }
  lPtr[n] = li;
  uPtr[n] = ui;
  return { n, nnzA: nnz, aMap, luSize: slotOf.size, stepRow, stepCol, pivot, lPtr, lIdx, lStep, uPtr, uIdx, uStep, ops };
}
