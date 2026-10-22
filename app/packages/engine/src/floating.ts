// Which parts of a singular matrix have no defined potential (simulation-engine.md §3).
//
// The row a factorization fails on is where it ran out of pivots, which is
// not always where the trouble is (a numerically tiny pivot can surface on a
// rail's node). So the engine also checks the structure of the assembled
// matrix: unknowns are joined when an entry couples them and at least one of
// the two is a node voltage (branch-branch couplings such as a transformer's
// mutual inductance carry no potential), and a group is anchored to ground
// when some row in it has node entries that do not sum to zero (a conductance
// to ground, or a source with one end on ground). A group of nodes with no
// anchor floats: its potential is undefined, and one ground tie fixes it.

import type { Assembly } from "./assembly";

/** Row sums below this fraction of a row's largest node entry count as zero. */
const SUM_REL = 1e-9;

/** For each floating group of nodes, its nodes (1-based unknowns), lowest first; nodes in `tied` count as anchors. */
export function floatingGroups(sys: Assembly, nodeCount: number, tied: readonly number[]): number[][] {
  const n = sys.size;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const sum = new Float64Array(n);
  const max = new Float64Array(n);
  const visit = (r: number, c: number, v: number) => {
    if (v === 0) return;
    if (c < nodeCount) {
      sum[r] += v;
      max[r] = Math.max(max[r], Math.abs(v));
    }
    if (r !== c && (r < nodeCount || c < nodeCount)) {
      const a = find(r);
      const b = find(c);
      if (a !== b) parent[b] = a;
    }
  };
  const values = sys.values();
  const pattern = sys.pattern();
  if (pattern.rows && pattern.cols) {
    const nnz = pattern.nnz ?? pattern.rows.length;
    for (let s = 0; s < nnz; s++) visit(pattern.rows[s], pattern.cols[s], values[s]);
  } else {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) visit(r, c, values[r * n + c]);
  }
  const anchored = new Set<number>();
  for (let r = 0; r < n; r++) if (max[r] > 0 && Math.abs(sum[r]) > SUM_REL * max[r]) anchored.add(find(r));
  for (const u of tied) anchored.add(find(u - 1));
  const groups = new Map<number, number[]>();
  for (let u = 0; u < nodeCount; u++) {
    const root = find(u);
    if (anchored.has(root)) continue;
    const g = groups.get(root);
    if (g) g.push(u + 1);
    else groups.set(root, [u + 1]);
  }
  return [...groups.values()];
}
