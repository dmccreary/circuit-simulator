// Stages 2–3: union the graph into nodes, then name and index them so that a
// node keeps its name across edits (anchored to its oldest terminal).
import type { CompiledCircuit, NodeIndex } from "../netlist";
import type { Point } from "../types";
import type { Graph } from "./collect";

export class UnionFind {
  private parent = new Map<string, string>();
  find(k: string): string {
    let p = this.parent.get(k);
    if (p === undefined) {
      this.parent.set(k, k);
      return k;
    }
    if (p === k) return k;
    const root = this.find(p);
    this.parent.set(k, root);
    return root;
  }
  union(a: string, b: string): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent.set(rb, ra);
    return true;
  }
}

export interface NodeGroup {
  index: NodeIndex;
  name: string;
  keys: string[];
  points: Point[];
}

export interface NodeAssignment {
  groups: NodeGroup[]; // index = NodeIndex
  keyToNode: Map<string, NodeIndex>;
  hasGround: boolean;
  /** Name the reference node would have had if the circuit had a ground. */
  referenceName?: string;
}

const AUTO = /^(.*\/)?N(\d+)$/;

export function assignNodes(g: Graph, previous: CompiledCircuit | undefined, preferredReference?: string): NodeAssignment {
  const uf = new UnionFind();
  for (const k of g.vertices.keys()) uf.find(k);
  for (const e of g.edges) uf.union(e.a, e.b);

  const byRoot = new Map<string, string[]>();
  for (const k of g.vertices.keys()) {
    const r = uf.find(k);
    const list = byRoot.get(r);
    if (list) list.push(k);
    else byRoot.set(r, [k]);
  }

  // Age of each group = position of its oldest anchor.
  const age = new Map<string, number>();
  g.anchors.forEach((a, i) => {
    const r = uf.find(a.key);
    if (!age.has(r)) age.set(r, i);
  });
  const roots = [...byRoot.keys()].sort((a, b) => (age.get(a) ?? Infinity) - (age.get(b) ?? Infinity));

  const groundRoot = g.vertices.has("net:GND") ? uf.find("net:GND") : undefined;
  const names = new Map<string, string>();
  const taken = new Set<string>();

  // Named nets first: ground, then labels in collection order.
  if (groundRoot !== undefined) {
    names.set(groundRoot, "GND");
    taken.add("GND");
  }
  for (const [netKey, display] of g.netNames) {
    const r = uf.find(netKey);
    if (names.has(r) || taken.has(display)) continue;
    names.set(r, display);
    taken.add(display);
  }

  // Reuse previous automatic names, oldest anchor first.
  const prevNames = previousAnchorNames(previous);
  const prevAll = new Set(previous?.nodes.map((n) => n.name) ?? []);
  for (const a of g.anchors) {
    const r = uf.find(a.key);
    if (names.has(r)) continue;
    const old = prevNames.get(a.name);
    if (!old || !AUTO.test(old) || taken.has(old)) continue;
    // A node's name may only be inherited at its own prefix level.
    if (!old.startsWith(a.labelPrefix) || old.slice(a.labelPrefix.length).includes("/")) continue;
    names.set(r, old);
    taken.add(old);
  }

  const counters = new Map<string, number>();
  const fresh = (prefix: string) => {
    let k = counters.get(prefix) ?? 1;
    while (taken.has(`${prefix}N${k}`) || prevAll.has(`${prefix}N${k}`)) k++;
    counters.set(prefix, k + 1);
    const n = `${prefix}N${k}`;
    taken.add(n);
    return n;
  };
  for (const r of roots) {
    if (names.has(r)) continue;
    const keys = byRoot.get(r)!;
    const topLevel = keys.some((k) => g.vertices.get(k)?.point);
    names.set(r, fresh(topLevel ? "" : g.vertices.get(keys[0])!.labelPrefix));
  }

  // Index 0 is ground, or a stand-in reference node when there is none.
  let refRoot = groundRoot;
  let referenceName: string | undefined;
  if (refRoot === undefined && roots.length > 0) {
    refRoot = preferredReference !== undefined && g.vertices.has(preferredReference) ? uf.find(preferredReference) : roots[0];
    referenceName = names.get(refRoot);
  }

  const ordered = refRoot === undefined ? roots : [refRoot, ...roots.filter((r) => r !== refRoot)];
  const groups: NodeGroup[] = [];
  const keyToNode = new Map<string, NodeIndex>();
  if (refRoot === undefined) groups.push({ index: 0, name: "GND", keys: [], points: [] });
  for (const r of ordered) {
    const index = groups.length;
    const keys = byRoot.get(r)!;
    const points: Point[] = [];
    for (const k of keys) {
      keyToNode.set(k, index);
      const p = g.vertices.get(k)?.point;
      if (p) points.push(p);
    }
    groups.push({ index, name: index === 0 ? "GND" : names.get(r)!, keys, points });
  }
  return { groups, keyToNode, hasGround: groundRoot !== undefined, referenceName };
}

/** Anchor name ("t:id:i" / "w:id") -> node name in the previous compilation. */
function previousAnchorNames(previous: CompiledCircuit | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!previous) return out;
  const nn = previous.netlist.nodeNames;
  for (const e of previous.netlist.elements) e.nodes.forEach((n, i) => out.set(`t:${e.id}:${i}`, nn[n]));
  for (const s of previous.segments) if (s.segment === 0) out.set(`w:${s.wire}`, previous.nodes[s.node]?.name);
  return out;
}
