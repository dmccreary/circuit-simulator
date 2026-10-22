// Wire segment currents from element terminal currents (for current dots and
// segment probes). Each node's wire graph gets a spanning tree; the current
// through a tree edge equals the total current drawn by the element terminals
// on one side of it (KCL). Chords of the tree carry no derivable current.
import type { SegmentInfo } from "../netlist";
import type { Edge, Graph } from "./collect";
import type { NodeAssignment } from "./nodes";

type Term = SegmentInfo["terms"][number];

export function segmentTerms(g: Graph, nodes: NodeAssignment): Map<string, Term[]> {
  // Terminals drawing current at each vertex.
  const atVertex = new Map<string, Term[]>();
  for (const el of g.elements) {
    el.keys.forEach((k, terminal) => {
      const t: Term = { element: el.id, terminal, sign: 1 };
      const list = atVertex.get(k);
      if (list) list.push(t);
      else atVertex.set(k, [t]);
    });
  }

  const adj = new Map<string, { edge: Edge; other: string }[]>();
  for (const e of g.edges) {
    if (e.a === e.b) continue;
    addAdj(adj, e.a, { edge: e, other: e.b });
    addAdj(adj, e.b, { edge: e, other: e.a });
  }

  const out = new Map<string, Term[]>(); // "wire#segment" -> terms, from -> to
  for (const group of nodes.groups) {
    const all = group.keys.flatMap((k) => atVertex.get(k) ?? []);
    const visited = new Set<string>();
    for (const root of group.keys) {
      if (visited.has(root)) continue;
      // Iterative DFS building a tree; then post-order subtree collections.
      const order: { v: string; parentEdge?: Edge; parent?: string }[] = [];
      const stack: { v: string; parentEdge?: Edge; parent?: string }[] = [{ v: root }];
      visited.add(root);
      while (stack.length) {
        const item = stack.pop()!;
        order.push(item);
        for (const { edge, other } of adj.get(item.v) ?? []) {
          if (visited.has(other)) continue;
          visited.add(other);
          stack.push({ v: other, parentEdge: edge, parent: item.v });
        }
      }
      const subtree = new Map<string, Term[]>();
      for (let i = order.length - 1; i >= 0; i--) {
        const { v, parentEdge, parent } = order[i];
        const mine = [...(atVertex.get(v) ?? []), ...(subtree.get(v) ?? [])];
        if (parent !== undefined) {
          const up = subtree.get(parent);
          if (up) up.push(...mine);
          else subtree.set(parent, [...mine]);
        }
        subtree.set(v, mine);
        const seg = parentEdge?.seg;
        if (!seg || !seg.first) continue;
        // Current parent -> v equals the sum drawn inside v's subtree.
        let terms = mine;
        let sign: 1 | -1 = 1;
        if (mine.length > all.length - mine.length) {
          const inside = new Set(mine.map(termKey));
          terms = all.filter((t) => !inside.has(termKey(t)));
          sign = -1;
        }
        // Edge.a is the segment's `from` side.
        if (parentEdge!.a !== parent) sign = sign === 1 ? -1 : 1;
        out.set(`${seg.wire}#${seg.segment}`, terms.map((t) => ({ ...t, sign })));
      }
    }
  }
  return out;
}

const termKey = (t: Term) => `${t.element}:${t.terminal}`;

function addAdj<V>(m: Map<string, V[]>, k: string, v: V): void {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}
