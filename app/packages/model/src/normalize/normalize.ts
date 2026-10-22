// The normalize pass run inside every commit (design/circuit-model.md §3.2):
// tidy wires (EDT-13), split wires at junctions and drops (EDT-06, EDT-11),
// assign labels (EDT-08), and drop probes whose target is gone (PRB-12).
import { newId } from "../document";
import type { PartResolver } from "../netlist";
import type { CircuitDocument, Id, Point, ProbeTarget } from "../types";
import { dedupe, insideSegment, key, onSegment, paramOf, same, straightThrough } from "./geometry";

export interface NormalizeOptions {
  /** Label prefix per part type ("resistor" -> "R"); defaults to the type's first letter. */
  labelPrefix?: (type: string) => string | undefined;
  /** Insert two-terminal parts dropped along a wire into it (EDT-06). Default true. */
  insertOnDrop?: boolean;
}

interface W {
  id: Id;
  points: Point[];
}

export function normalize(draft: CircuitDocument, resolver: PartResolver, options: NormalizeOptions = {}): void {
  const original = new Map<Id, Point[]>();
  for (const w of Object.values(draft.wires)) original.set(w.id, w.points.map((p) => ({ x: p.x, y: p.y })));

  const terminals: Point[][] = [];
  const partTerminals = new Map<Id, Point[]>();
  for (const part of Object.values(draft.parts)) {
    let pts: Point[] = [];
    try {
      pts = resolver.terminals(part);
    } catch {
      pts = [];
    }
    partTerminals.set(part.id, pts);
    terminals.push(pts);
  }
  const labelPoints = Object.values(draft.netLabels).map((l) => l.at);

  let ws: W[] = [...original].map(([id, pts]) => ({ id, points: dedupe(pts) })).filter((w) => w.points.length >= 2);

  if (options.insertOnDrop !== false) {
    for (const part of Object.values(draft.parts)) {
      if (resolver.traits(part.type).netName) continue;
      const pts = partTerminals.get(part.id) ?? [];
      if (pts.length === 2 && !same(pts[0], pts[1])) ws = insertPart(ws, pts[0], pts[1]);
    }
  }

  const anchors = [...terminals.flat(), ...labelPoints, ...ws.flatMap((w) => [w.points[0], w.points[w.points.length - 1]])];
  ws = ws.flatMap((w) => splitAt(w, anchors));
  ws = mergeRuns(ws, terminals.flat(), labelPoints);
  ws = dropStraightVertices(ws, terminals.flat(), labelPoints);

  // Write back only what changed, to keep structural sharing.
  const next = new Map(ws.map((w) => [w.id, w.points]));
  let wiresChanged = false;
  for (const [id, pts] of original) {
    const now = next.get(id);
    if (!now) {
      delete draft.wires[id];
      wiresChanged = true;
    } else if (!samePoints(pts, now)) {
      draft.wires[id].points = now;
      wiresChanged = true;
    }
  }
  for (const w of ws) {
    if (!original.has(w.id)) {
      draft.wires[w.id] = { id: w.id, points: w.points };
      wiresChanged = true;
    }
  }

  assignLabels(draft, resolver, options);
  fixProbes(draft, wiresChanged ? { original, current: ws } : undefined);
}

/** Remove the stretch of wire between a two-terminal part's terminals. */
function insertPart(ws: W[], a: Point, b: Point): W[] {
  for (let wi = 0; wi < ws.length; wi++) {
    const w = ws[wi];
    for (let i = 0; i < w.points.length - 1; i++) {
      const s = w.points[i];
      const e = w.points[i + 1];
      if (!onSegment(a, s, e) || !onSegment(b, s, e)) continue;
      const [near, far] = paramOf(a, s, e) <= paramOf(b, s, e) ? [a, b] : [b, a];
      const head = dedupe([...w.points.slice(0, i + 1), near]);
      const tail = dedupe([far, ...w.points.slice(i + 1)]);
      const pieces: W[] = [];
      if (head.length >= 2) pieces.push({ id: w.id, points: head });
      if (tail.length >= 2) pieces.push({ id: pieces.length ? newId("w") : w.id, points: tail });
      return [...ws.slice(0, wi), ...pieces, ...ws.slice(wi + 1)];
    }
  }
  return ws;
}

/** Split a wire wherever an anchor lies strictly inside one of its segments. */
function splitAt(w: W, anchors: Point[]): W[] {
  const pieces: Point[][] = [];
  let cur: Point[] = [w.points[0]];
  for (let i = 0; i < w.points.length - 1; i++) {
    const s = w.points[i];
    const e = w.points[i + 1];
    const seen = new Set<string>();
    const mids = anchors
      .filter((p) => insideSegment(p, s, e) && !seen.has(key(p)) && seen.add(key(p)))
      .sort((p, q) => paramOf(p, s, e) - paramOf(q, s, e));
    for (const m of mids) {
      cur.push({ x: m.x, y: m.y });
      pieces.push(cur);
      cur = [{ x: m.x, y: m.y }];
    }
    cur.push(e);
  }
  pieces.push(cur);
  return pieces.map((points, i) => ({ id: i === 0 ? w.id : newId("w"), points }));
}

/** Join wires meeting end to end in a straight line with nothing else at the joint. */
function mergeRuns(ws: W[], terms: Point[], labels: Point[]): W[] {
  const fixed = new Set([...terms, ...labels].map(key));
  for (;;) {
    const ends = new Map<string, { w: number; start: boolean }[]>();
    const interior = new Set<string>();
    ws.forEach((w, wi) => {
      const n = w.points.length;
      w.points.forEach((p, i) => {
        if (i === 0 || i === n - 1) {
          const k = key(p);
          ends.set(k, [...(ends.get(k) ?? []), { w: wi, start: i === 0 }]);
        } else interior.add(key(p));
      });
    });
    let merged = false;
    for (const [k, list] of ends) {
      if (list.length !== 2 || fixed.has(k) || interior.has(k) || list[0].w === list[1].w) continue;
      const [x, y] = list[0].w < list[1].w ? list : [list[1], list[0]];
      const A = ws[x.w].points;
      const B = ws[y.w].points;
      const nA = x.start ? A[1] : A[A.length - 2];
      const nB = y.start ? B[1] : B[B.length - 2];
      const joint = x.start ? A[0] : A[A.length - 1];
      if (!straightThrough(nA, joint, nB)) continue;
      const bFromJoint = y.start ? B : [...B].reverse();
      const points = x.start ? [...[...bFromJoint].reverse(), ...A.slice(1)] : [...A, ...bFromJoint.slice(1)];
      const keep = { id: ws[x.w].id, points };
      ws = ws.map((w, i) => (i === x.w ? keep : w)).filter((_, i) => i !== y.w);
      merged = true;
      break;
    }
    if (!merged) return ws;
  }
}

/** Remove bend points that do not bend and that nothing else touches. */
function dropStraightVertices(ws: W[], terms: Point[], labels: Point[]): W[] {
  const count = new Map<string, number>();
  const bump = (p: Point) => count.set(key(p), (count.get(key(p)) ?? 0) + 1);
  terms.forEach(bump);
  labels.forEach(bump);
  ws.forEach((w) => w.points.forEach(bump));
  return ws.map((w) => {
    const pts = w.points;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      if (count.get(key(pts[i])) === 1 && straightThrough(out[out.length - 1], pts[i], pts[i + 1])) continue;
      out.push(pts[i]);
    }
    out.push(pts[pts.length - 1]);
    return out.length === pts.length ? w : { id: w.id, points: out };
  });
}

function samePoints(a: Point[], b: Point[]): boolean {
  return a.length === b.length && a.every((p, i) => same(p, b[i]));
}

// ---------------------------------------------------------------- labels

/** Lowest free label "<prefix><n>" in the document (EDT-08). */
export function nextLabel(doc: Pick<CircuitDocument, "parts">, prefix: string): string {
  const used = new Set<number>();
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  for (const p of Object.values(doc.parts)) {
    const m = re.exec(p.label);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}${n}`;
}

function assignLabels(draft: CircuitDocument, resolver: PartResolver, options: NormalizeOptions): void {
  for (const part of Object.values(draft.parts)) {
    if (part.label) continue;
    if (resolver.traits(part.type).netName) continue;
    const prefix = options.labelPrefix?.(part.type) ?? (part.type.replace(/^.*:/, "")[0] ?? "X").toUpperCase();
    draft.parts[part.id].label = nextLabel(draft, prefix);
  }
}

// ---------------------------------------------------------------- probes

interface WireRemap {
  original: Map<Id, Point[]>;
  current: W[];
}

function fixProbes(draft: CircuitDocument, remap: WireRemap | undefined): void {
  for (const probe of Object.values(draft.probes)) {
    const t = fixTarget(probe.target, draft, remap);
    if (!t) delete draft.probes[probe.id];
    else if (t !== probe.target) draft.probes[probe.id].target = t;
  }
  for (const s of Object.values(draft.sliders)) if (!draft.parts[s.part]) delete draft.sliders[s.id];
}

/** The same target (identity) if unchanged, a new one if remapped, undefined if gone. */
function fixTarget(t: ProbeTarget, draft: CircuitDocument, remap: WireRemap | undefined): ProbeTarget | undefined {
  // Inside a subcircuit instance ("u1/r3", circuit-model.md §6): kept while the instance exists.
  const path = t.kind === "between" ? undefined : "part" in t ? t.part : t.wire;
  if (path?.includes("/")) return draft.parts[path.split("/")[0]] ? t : undefined;
  switch (t.kind) {
    case "terminal":
    case "across":
    case "through":
      return draft.parts[t.part] ? t : undefined;
    case "between": {
      const a = fixTarget(t.a, draft, remap);
      const b = fixTarget(t.b, draft, remap);
      if (!a || !b) return undefined;
      return a === t.a && b === t.b ? t : { ...t, a, b };
    }
    case "point":
    case "segment": {
      if (!remap) return (draft.wires[t.wire]?.points.length ?? 0) > t.segment + 1 ? t : undefined;
      const old = remap.original.get(t.wire);
      if (!old || t.segment + 1 >= old.length) return undefined;
      const s = old[t.segment];
      const e = old[t.segment + 1];
      const tt = t.kind === "point" ? t.t : 0.5;
      const at = { x: s.x + (e.x - s.x) * tt, y: s.y + (e.y - s.y) * tt };
      const dir = { x: Math.sign(e.x - s.x), y: Math.sign(e.y - s.y) };
      // Prefer the same wire, then any wire through that place.
      const candidates = [...remap.current.filter((w) => w.id === t.wire), ...remap.current.filter((w) => w.id !== t.wire)];
      for (const w of candidates) {
        for (let i = 0; i < w.points.length - 1; i++) {
          const a = w.points[i];
          const b = w.points[i + 1];
          if (!onSegment(at, a, b)) continue;
          if (w.id === t.wire && i === t.segment && same(a, s) && same(b, e)) return t;
          if (t.kind === "point") return { kind: "point", wire: w.id, segment: i, t: paramOf(at, a, b) };
          const flipped = Math.sign(b.x - a.x) !== dir.x || Math.sign(b.y - a.y) !== dir.y;
          return { kind: "segment", wire: w.id, segment: i, reversed: flipped ? !t.reversed : t.reversed };
        }
      }
      return undefined;
    }
  }
}
