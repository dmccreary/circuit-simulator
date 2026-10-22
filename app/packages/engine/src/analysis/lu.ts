// Dense LU factorizations with partial pivoting for the analysis service:
// a real one for DC operating points and a complex one for the small-signal
// (frequency response) solve. Kept inside analysis/ so the live engine's
// solver can change (sparse LU) without touching analyses.

export class AnalysisSingularError extends Error {
  constructor(readonly row: number) {
    super(`singular matrix at row ${row}`);
  }
}

const PIVOT_MIN = 1e-300;

/** Solve A·x = b in place (A is n×n row-major and is overwritten; b becomes x). */
export function solveReal(A: Float64Array, b: Float64Array, n: number): void {
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = Math.abs(A[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]);
      if (v > best) {
        best = v;
        p = i;
      }
    }
    if (!(best > PIVOT_MIN)) throw new AnalysisSingularError(k);
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = A[k * n + j];
        A[k * n + j] = A[p * n + j];
        A[p * n + j] = t;
      }
      const t = b[k];
      b[k] = b[p];
      b[p] = t;
    }
    const d = A[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / d;
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j];
      b[i] -= f * b[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * b[j];
    b[i] = s / A[i * n + i];
  }
}

/**
 * Solve the complex system (Ar + j·Ai)·x = (br + j·bi) in place. Matrices are
 * n×n row-major; on return br/bi hold the real and imaginary parts of x.
 */
export function solveComplex(Ar: Float64Array, Ai: Float64Array, br: Float64Array, bi: Float64Array, n: number): void {
  const swap = (a: Float64Array, i: number, j: number) => {
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  };
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = Math.hypot(Ar[k * n + k], Ai[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.hypot(Ar[i * n + k], Ai[i * n + k]);
      if (v > best) {
        best = v;
        p = i;
      }
    }
    if (!(best > PIVOT_MIN)) throw new AnalysisSingularError(k);
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        swap(Ar, k * n + j, p * n + j);
        swap(Ai, k * n + j, p * n + j);
      }
      swap(br, k, p);
      swap(bi, k, p);
    }
    const dr = Ar[k * n + k];
    const di = Ai[k * n + k];
    const den = dr * dr + di * di;
    for (let i = k + 1; i < n; i++) {
      const ar = Ar[i * n + k];
      const ai = Ai[i * n + k];
      if (ar === 0 && ai === 0) continue;
      // f = a / d
      const fr = (ar * dr + ai * di) / den;
      const fi = (ai * dr - ar * di) / den;
      for (let j = k + 1; j < n; j++) {
        const ur = Ar[k * n + j];
        const ui = Ai[k * n + j];
        Ar[i * n + j] -= fr * ur - fi * ui;
        Ai[i * n + j] -= fr * ui + fi * ur;
      }
      const vr = br[k];
      const vi = bi[k];
      br[i] -= fr * vr - fi * vi;
      bi[i] -= fr * vi + fi * vr;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let sr = br[i];
    let si = bi[i];
    for (let j = i + 1; j < n; j++) {
      const ar = Ar[i * n + j];
      const ai = Ai[i * n + j];
      sr -= ar * br[j] - ai * bi[j];
      si -= ar * bi[j] + ai * br[j];
    }
    const dr = Ar[i * n + i];
    const di = Ai[i * n + i];
    const den = dr * dr + di * di;
    br[i] = (sr * dr + si * di) / den;
    bi[i] = (si * dr - sr * di) / den;
  }
}
