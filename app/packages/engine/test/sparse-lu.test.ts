import { DenseLU, SingularError, SparseLU, SparseMnaSystem } from "@cs/engine";

/** Deterministic xorshift for test matrices. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

interface Coo {
  n: number;
  rows: Int32Array;
  cols: Int32Array;
  vals: Float64Array;
}

function toDense(m: Coo): Float64Array {
  const a = new Float64Array(m.n * m.n);
  for (let k = 0; k < m.vals.length; k++) a[m.rows[k] * m.n + m.cols[k]] += m.vals[k];
  return a;
}

/** Random sparse, diagonally dominant (well-conditioned) matrix with a few entries per row. */
function randomMatrix(n: number, perRow: number, seed: number): Coo {
  const r = rng(seed);
  const map = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let t = 0; t < perRow; t++) {
      const j = Math.floor(r() * n);
      if (j === i) continue;
      const v = r() * 2 - 1;
      map.set(i * n + j, (map.get(i * n + j) ?? 0) + v);
      sum += Math.abs(v);
    }
    map.set(i * n + i, sum + 1 + r());
  }
  return fromMap(n, map);
}

function fromMap(n: number, map: Map<number, number>): Coo {
  const keys = [...map.keys()];
  return {
    n,
    rows: Int32Array.from(keys, (k) => Math.floor(k / n)),
    cols: Int32Array.from(keys, (k) => k % n),
    vals: Float64Array.from(keys, (k) => map.get(k)!),
  };
}

/** An MNA-like matrix: a resistor network with voltage sources (zero diagonals on branch rows). */
function mnaMatrix(nodes: number, sources: number, seed: number): { sys: SparseMnaSystem; n: number } {
  const r = rng(seed);
  const n = nodes + sources;
  const sys = new SparseMnaSystem(n, nodes);
  sys.beginStatic();
  for (let a = 1; a <= nodes; a++) {
    sys.conductance(a, a < nodes ? a + 1 : 0, 1e-3 * (1 + r()));
    const b = Math.floor(r() * (nodes + 1));
    if (b !== a) sys.conductance(a, b, 10 ** (-6 + 6 * r()));
  }
  for (let s = 0; s < sources; s++) {
    const plus = 1 + Math.floor((s * nodes) / sources);
    sys.voltageSource(nodes + 1 + s, plus, 0, 1 + s);
  }
  sys.endStatic();
  sys.begin();
  return { sys, n };
}

function solveDense(n: number, a: Float64Array, b: Float64Array): Float64Array {
  const lu = new DenseLU();
  lu.analyze({ size: n });
  lu.factor(a);
  const x = b.slice();
  lu.solve(x);
  return x;
}

function solveSparse(lu: SparseLU, m: Coo, b: Float64Array): Float64Array {
  lu.factor(m.vals);
  const x = b.slice();
  lu.solve(x);
  return x;
}

function maxRelDiff(a: Float64Array, b: Float64Array): number {
  let scale = 0;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    scale = Math.max(scale, Math.abs(a[i]));
    d = Math.max(d, Math.abs(a[i] - b[i]));
  }
  return d / Math.max(scale, 1e-300);
}

describe("SparseLU", () => {
  test.each([
    [10, 3, 1],
    [60, 4, 2],
    [200, 5, 3],
    [500, 3, 4],
  ])("matches dense LU on random well-conditioned %i x %i", (n, perRow, seed) => {
    const m = randomMatrix(n, perRow, seed);
    const r = rng(seed + 100);
    const b = Float64Array.from({ length: n }, () => r() * 2 - 1);
    const lu = new SparseLU();
    lu.analyze({ size: n, rows: m.rows, cols: m.cols });
    const xs = solveSparse(lu, m, b);
    const xd = solveDense(n, toDense(m), b);
    expect(maxRelDiff(xs, xd)).toBeLessThan(1e-9);
  });

  test("matches dense LU on MNA-like matrices with zero diagonals", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { sys, n } = mnaMatrix(80, 6, seed);
      const p = sys.pattern();
      const lu = new SparseLU();
      lu.analyze(p);
      lu.factor(sys.values());
      const xs = sys.b.slice();
      lu.solve(xs);
      const dense = new Float64Array(n * n);
      for (let k = 0; k < p.nnz!; k++) dense[p.rows![k] * n + p.cols![k]] = sys.values()[k];
      const xd = solveDense(n, dense, sys.b);
      expect(maxRelDiff(xs, xd)).toBeLessThan(1e-9);
    }
  });

  test("refactors with the stored ordering and is deterministic", () => {
    const m = randomMatrix(120, 4, 7);
    const b = Float64Array.from({ length: 120 }, (_, i) => Math.sin(i));
    const a = new SparseLU();
    a.analyze({ size: 120, rows: m.rows, cols: m.cols });
    const x1 = solveSparse(a, m, b);
    // Scale the values a little: same ordering, new numbers.
    const m2 = { ...m, vals: m.vals.map((v, k) => v * (1 + 1e-3 * (k % 7))) };
    const x2 = solveSparse(a, m2, b);
    expect(a.reorders).toBe(1);
    const fresh = new SparseLU();
    fresh.analyze({ size: 120, rows: m.rows, cols: m.cols });
    expect(Array.from(solveSparse(fresh, m, b))).toEqual(Array.from(x1));
    // A restored ordering replays bit-identically.
    const saved = fresh.snapshot();
    const replay = new SparseLU();
    replay.analyze({ size: 120, rows: m.rows, cols: m.cols });
    replay.restore(saved);
    expect(Array.from(solveSparse(replay, m2, b))).toEqual(Array.from(x2));
    expect(replay.reorders).toBe(0);
  });

  test("re-orders when a reused pivot collapses", () => {
    // [[e, 1], [1, 1]]: first ordered with a large (1,1) pivot, then made tiny.
    const n = 2;
    const rows = Int32Array.from([0, 0, 1, 1]);
    const cols = Int32Array.from([0, 1, 0, 1]);
    const lu = new SparseLU();
    lu.analyze({ size: n, rows, cols });
    lu.factor(Float64Array.from([5, 1, 1, 1]));
    const vals = Float64Array.from([1e-12, 1, 1, 1]);
    lu.factor(vals);
    const x = Float64Array.from([1, 2]);
    lu.solve(x);
    const xd = solveDense(n, Float64Array.from([1e-12, 1, 1, 1]), Float64Array.from([1, 2]));
    expect(maxRelDiff(x, xd)).toBeLessThan(1e-12);
  });

  test("handles slots added after the ordering while they stay zero", () => {
    const m = randomMatrix(50, 3, 11);
    const lu = new SparseLU();
    lu.analyze({ size: 50, rows: m.rows, cols: m.cols });
    lu.factor(m.vals);
    // Add a structural slot (r, 49) not yet present, with value 0: no re-order.
    let r = 0;
    while ([...m.rows].some((row, k) => row === r && m.cols[k] === 49)) r++;
    const rows = Int32Array.from([...m.rows, r]);
    const cols = Int32Array.from([...m.cols, 49]);
    lu.analyze({ size: 50, rows, cols });
    lu.factor(Float64Array.from([...m.vals, 0]));
    expect(lu.reorders).toBe(1);
    // Nonzero: re-order and stay correct.
    const vals = Float64Array.from([...m.vals, 0.5]);
    lu.factor(vals);
    expect(lu.reorders).toBe(2);
    const b = Float64Array.from({ length: 50 }, (_, i) => i - 25);
    const x = b.slice();
    lu.solve(x);
    const xd = solveDense(50, toDense({ n: 50, rows, cols, vals }), b);
    expect(maxRelDiff(x, xd)).toBeLessThan(1e-10);
  });

  test("reports the failing column of a singular matrix", () => {
    // Column 2 (unknown 3) is empty: nothing connects to it.
    const n = 4;
    const map = new Map<number, number>([
      [0 * n + 0, 2],
      [0 * n + 1, -1],
      [1 * n + 0, -1],
      [1 * n + 1, 2],
      [3 * n + 3, 1],
      [2 * n + 0, 1],
    ]);
    const m = fromMap(n, map);
    const lu = new SparseLU();
    lu.analyze({ size: n, rows: m.rows, cols: m.cols });
    let err: unknown;
    try {
      lu.factor(m.vals);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SingularError);
    expect((err as SingularError).row).toBe(2);
  });

  test("reports numerically singular columns (two identical sources in parallel)", () => {
    // Two 1 V sources across node 1: branch columns 1 and 2 are dependent.
    const sys = new SparseMnaSystem(3, 1);
    sys.beginStatic();
    sys.conductance(1, 0, 1e-3);
    sys.voltageSource(2, 1, 0, 1);
    sys.voltageSource(3, 1, 0, 1);
    sys.endStatic();
    sys.begin();
    const lu = new SparseLU();
    lu.analyze(sys.pattern());
    expect(() => lu.factor(sys.values())).toThrow(SingularError);
  });
});
