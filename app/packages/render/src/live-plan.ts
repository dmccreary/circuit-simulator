// What the live layer draws every frame, worked out once per circuit
// (rendering.md §2.2): wire segments and terminal dots grouped by node, so a
// frame strokes one path and fills one path per node instead of one per
// segment, and allocates nothing.

import type { CircuitDocument, CompiledCircuit, Part, Point } from "@cs/model";
import { pointKey } from "@cs/model";
import type { ElementView, LiveReadouts } from "@cs/elements";

export interface NodeGroup {
  /** Node index, or -1 when the compiler has not assigned one. */
  node: number;
  /** Grid coordinates: x0 y0 x1 y1 per wire segment, or x y per terminal. */
  coords: Float64Array;
}

export interface LivePart {
  part: Part;
  view: ElementView;
  /** Node of each terminal (-1 when unknown). */
  nodes: Int32Array;
  /** Reused every frame; terminalVoltages is filled in place. */
  live: LiveReadouts;
}

export class LiveLayerPlan {
  wires: NodeGroup[] = [];
  terminals: NodeGroup[] = [];
  liveParts: LivePart[] = [];

  build(
    doc: CircuitDocument,
    compiled: CompiledCircuit | undefined,
    terminals: ReadonlyMap<string, Point[]>,
    getView: (type: string) => ElementView | undefined,
    /** Live values by part and readout key (live-effects.ts); none when absent. */
    readout?: (partId: string, key: string) => number | undefined,
  ): void {
    const nodeAt = (p: Point): number => compiled?.pointToNode.get(pointKey(p)) ?? -1;
    const segNode = new Map<string, number>();
    for (const s of compiled?.segments ?? []) segNode.set(`${s.wire}:${s.segment}`, s.node);

    const wires = new Map<number, number[]>();
    for (const w of Object.values(doc.wires)) {
      for (let i = 0; i + 1 < w.points.length; i++) {
        const node = segNode.get(`${w.id}:${i}`) ?? nodeAt(w.points[i]);
        const a = w.points[i];
        const b = w.points[i + 1];
        push(wires, node, a.x, a.y, b.x, b.y);
      }
    }
    const terms = new Map<number, number[]>();
    const liveParts: LivePart[] = [];
    for (const part of Object.values(doc.parts)) {
      const ts = terminals.get(part.id) ?? [];
      const nodes = Int32Array.from(ts, nodeAt);
      ts.forEach((t, i) => push(terms, nodes[i], t.x, t.y));
      const view = getView(part.type);
      if (view?.drawLive) {
        const terminalVoltages: number[] = new Array<number>(nodes.length).fill(0);
        const id = part.id;
        const get = readout ? (key: string) => readout(id, key) : () => undefined;
        liveParts.push({ part, view, nodes, live: { get, terminalVoltages } });
      }
    }
    this.wires = groups(wires);
    this.terminals = groups(terms);
    this.liveParts = liveParts;
  }
}

function push(m: Map<number, number[]>, node: number, ...xs: number[]): void {
  let list = m.get(node);
  if (!list) {
    list = [];
    m.set(node, list);
  }
  list.push(...xs);
}

function groups(m: Map<number, number[]>): NodeGroup[] {
  return [...m].map(([node, list]) => ({ node, coords: Float64Array.from(list) }));
}
