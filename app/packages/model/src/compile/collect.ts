// Stage 1 of the compiler: turn document geometry into a connectivity graph.
// Vertices are string keys: "x,y" for top-level grid points, "<path>/x,y" for
// points inside a subcircuit instance, "net:NAME" for named nets.
import type { PartResolver, PartTraits } from "../netlist";
import { pointKey } from "../netlist";
import type { CircuitDocument, Diagnostic, Id, NetLabel, Part, Point, Wire } from "../types";

export interface Edge {
  a: string;
  b: string;
  /** Set for pieces of top-level wire segments; `a` is on the segment's `from` side. */
  seg?: { wire: Id; segment: number; first: boolean };
}

export interface ElementRec {
  id: string; // element id ("p1" or "U1/R3")
  part: Part;
  traits: PartTraits;
  keys: string[]; // vertex key per terminal
  topLevel: boolean;
}

export interface Anchor {
  name: string; // "t:<element id>:<terminal>" or "w:<wire id>"
  key: string;
  labelPrefix: string; // "" at top level, "U1/" inside an instance
}

export interface SegmentRec {
  wire: Id;
  segment: number;
  from: Point;
  to: Point;
  fromKey: string;
}

export interface Graph {
  vertices: Map<string, { point?: Point; labelPrefix: string }>;
  edges: Edge[];
  elements: ElementRec[];
  anchors: Anchor[];
  netNames: Map<string, string>;
  /** Top level: how many things touch each grid point (for dangling ends). */
  touches: Map<string, number>;
  wireEnds: { wire: Id; key: string; point: Point }[];
  terminals: { part: Id; terminal: number; key: string; point: Point }[];
  segments: SegmentRec[];
  diagnostics: Diagnostic[];
}

interface Sheet {
  parts: Record<Id, Part>;
  wires: Record<Id, Wire>;
  netLabels: Record<Id, NetLabel>;
  pins?: { at: Point }[];
}

export const SUBCIRCUIT_TYPE = "subcircuit";

export function collect(doc: CircuitDocument, resolver: PartResolver): Graph {
  const g: Graph = {
    vertices: new Map(),
    edges: [],
    elements: [],
    anchors: [],
    netNames: new Map(),
    touches: new Map(),
    wireEnds: [],
    terminals: [],
    segments: [],
    diagnostics: [],
  };
  const wireAnchors: Anchor[] = [];
  collectSheet(doc, doc, resolver, "", "", g, wireAnchors, new Set());
  g.anchors.push(...wireAnchors);
  return g;
}

function collectSheet(
  doc: CircuitDocument,
  sheet: Sheet,
  resolver: PartResolver,
  prefix: string, // id/key prefix, "" or "p7/"
  labelPrefix: string, // display prefix, "" or "U1/"
  g: Graph,
  wireAnchors: Anchor[],
  stack: Set<Id>,
): void {
  const top = prefix === "";
  const key = (p: Point) => prefix + pointKey(p);
  const vertex = (p: Point) => {
    const k = key(p);
    if (!g.vertices.has(k)) g.vertices.set(k, { point: top ? { x: p.x, y: p.y } : undefined, labelPrefix });
    return k;
  };
  const touch = (k: string, n = 1) => {
    if (top) g.touches.set(k, (g.touches.get(k) ?? 0) + n);
  };
  const netVertex = (name: string) => {
    const k = name === "GND" ? "net:GND" : `${prefix}net:${name}`;
    if (!g.vertices.has(k)) g.vertices.set(k, { labelPrefix: name === "GND" ? "" : labelPrefix });
    if (!g.netNames.has(k)) g.netNames.set(k, name === "GND" ? "GND" : labelPrefix + name);
    return k;
  };

  // Points where something can attach to the middle of a wire (EDT-11).
  const anchorPoints: Point[] = (sheet.pins ?? []).map((p) => p.at);

  for (const part of Object.values(sheet.parts)) {
    const elemId = prefix + part.id;
    const traits = resolver.traits(part.type);
    let pts: Point[] = [];
    try {
      pts = resolver.terminals(part);
    } catch {
      pts = [];
    }
    const keys = pts.map(vertex);
    pts.forEach((p, i) => {
      touch(keys[i]);
      anchorPoints.push(p);
      if (top) g.terminals.push({ part: part.id, terminal: i, key: keys[i], point: p });
      g.anchors.push({ name: `t:${elemId}:${i}`, key: keys[i], labelPrefix });
    });

    if (part.type === SUBCIRCUIT_TYPE) {
      const defId = part.props.definition;
      const def = typeof defId === "string" ? doc.subcircuits[defId] : undefined;
      if (!def || stack.has(def.id)) {
        g.diagnostics.push(unknownPart(elemId, part.type));
        continue;
      }
      const innerPrefix = `${elemId}/`;
      const innerLabel = `${labelPrefix}${part.label || part.id}/`;
      stack.add(def.id);
      collectSheet(doc, def, resolver, innerPrefix, innerLabel, g, wireAnchors, stack);
      stack.delete(def.id);
      def.pins.forEach((pin, i) => {
        if (i >= keys.length) return;
        const inner = innerPrefix + pointKey(pin.at);
        if (!g.vertices.has(inner)) g.vertices.set(inner, { labelPrefix: innerLabel });
        g.edges.push({ a: keys[i], b: inner });
      });
      continue;
    }
    if (!traits.known || part.type === "falstad:placeholder") {
      g.diagnostics.push(unknownPart(elemId, part.type));
      continue;
    }
    if (traits.netName) {
      if (keys.length > 0) g.edges.push({ a: keys[0], b: netVertex(traits.netName) });
      continue;
    }
    g.elements.push({ id: elemId, part, traits, keys, topLevel: top });
  }

  for (const label of Object.values(sheet.netLabels)) {
    const k = vertex(label.at);
    touch(k);
    anchorPoints.push(label.at);
    g.edges.push({ a: k, b: netVertex(label.name) });
  }

  const wires = Object.values(sheet.wires).filter((w) => w.points.length >= 2);
  for (const w of wires) {
    const n = w.points.length;
    w.points.forEach((p, i) => touch(vertex(p), i === 0 || i === n - 1 ? 1 : 2));
    anchorPoints.push(w.points[0], w.points[n - 1]);
    const k0 = key(w.points[0]);
    wireAnchors.push({ name: `w:${prefix}${w.id}`, key: k0, labelPrefix });
    if (top) {
      g.wireEnds.push({ wire: w.id, key: k0, point: w.points[0] });
      g.wireEnds.push({ wire: w.id, key: key(w.points[n - 1]), point: w.points[n - 1] });
    }
  }

  const attachments = findAttachments(wires, anchorPoints);
  for (const w of wires) {
    for (let i = 0; i < w.points.length - 1; i++) {
      const from = w.points[i];
      const to = w.points[i + 1];
      const mids = attachments.get(`${w.id}#${i}`) ?? [];
      mids.sort((p, q) => dist(from, p) - dist(from, q));
      const chain = [from, ...mids, to];
      for (let j = 0; j < chain.length - 1; j++) {
        const a = vertex(chain[j]);
        const b = vertex(chain[j + 1]);
        g.edges.push({ a, b, seg: top ? { wire: w.id, segment: i, first: j === 0 } : undefined });
      }
      for (const m of mids) touch(key(m), 2);
      if (top) g.segments.push({ wire: w.id, segment: i, from, to, fromKey: key(from) });
    }
  }
}

const dist = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Anchor points lying strictly inside an axis-aligned wire segment, keyed "wireId#segment". */
function findAttachments(wires: Wire[], anchors: Point[]): Map<string, Point[]> {
  const horiz = new Map<number, { lo: number; hi: number; id: string }[]>();
  const vert = new Map<number, { lo: number; hi: number; id: string }[]>();
  for (const w of wires) {
    for (let i = 0; i < w.points.length - 1; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      const id = `${w.id}#${i}`;
      if (a.y === b.y && a.x !== b.x) push(horiz, a.y, { lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), id });
      else if (a.x === b.x && a.y !== b.y) push(vert, a.x, { lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), id });
    }
  }
  const out = new Map<string, Point[]>();
  const seen = new Set<string>();
  for (const p of anchors) {
    const k = pointKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    for (const s of horiz.get(p.y) ?? []) if (p.x > s.lo && p.x < s.hi) push(out, s.id, p);
    for (const s of vert.get(p.x) ?? []) if (p.y > s.lo && p.y < s.hi) push(out, s.id, p);
  }
  return out;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

function unknownPart(id: string, type: string): Diagnostic {
  const placeholder = type === "falstad:placeholder";
  return {
    id: placeholder ? "placeholder" : "unknown-part",
    severity: "warning",
    message: { key: placeholder ? "diag.placeholder" : "diag.unknownPart", values: { type } },
    elements: [id],
  };
}
