// "Make subcircuit from selection" (EDT-34): move the selected parts and wires
// into a new definition, put a block in their place, and reconnect every net
// that crossed the selection boundary through a pin, so the flattened circuit
// is electrically unchanged.

import type { PartResolver } from "../netlist";
import { pointKey } from "../netlist";
import type { CircuitDocument, Id, NetLabel, Part, Point, ProbeTarget, SubcircuitDefinition } from "../types";
import { UnionFind } from "../compile/nodes";
import { netKey, segmentPoints, strictlyInside, terminalsOf, unionSheet } from "./connectivity";
import { defaultLayout, encodeLayout, type PinSide } from "./layout";

export const SUBCIRCUIT_TYPE = "subcircuit";

export interface MakeOptions {
  resolver: PartResolver;
  newId: (prefix: string) => Id;
  /** Definition name shown in My parts and on the block. */
  name: string;
  /** Label for the new instance ("U1"). */
  label: string;
  /** Points that already connect outside this sheet (an enclosing definition's pins). */
  extraAnchors?: Point[];
  /** The student's names and sides for the proposed pins, in the order a first call returned them. */
  pins?: ({ name?: string; side?: PinSide } | undefined)[];
}

export type MakeResult =
  | { ok: true; definition: Id; instance: Id; pins: { name: string; side: PinSide }[] }
  | { ok: false; reason: "empty" | "nothing-left" };

interface PinPlan {
  name: string;
  side: PinSide;
  inner: Point;
  innerLabels: Point[];
  targets: { point: Point; root: string }[];
  order: number;
}

export function makeSubcircuit(d: CircuitDocument, ids: readonly Id[], opts: MakeOptions): MakeResult {
  const { resolver } = opts;
  const sel = new Set(ids);
  const inParts = Object.values(d.parts).filter((p) => sel.has(p.id));
  const inWires = Object.values(d.wires).filter((w) => sel.has(w.id));
  if (!inParts.length) return { ok: false, reason: "empty" };
  const outParts = Object.values(d.parts).filter((p) => !sel.has(p.id));
  const outWires = Object.values(d.wires).filter((w) => !sel.has(w.id));
  const labels = Object.values(d.netLabels);
  const extra = opts.extraAnchors ?? [];

  // Every point touched by inside and by outside items.
  const inside = new Map<string, Point>();
  const outside = new Map<string, Point>();
  const add = (m: Map<string, Point>, p: Point) => m.set(pointKey(p), p);
  const innerGround = new Set<string>();
  for (const p of inParts) {
    const pts = terminalsOf(p, resolver);
    pts.forEach((q) => add(inside, q));
    if (resolver.traits(p.type).netName === "GND" && pts.length) innerGround.add(pointKey(pts[0]));
  }
  for (const w of inWires) w.points.forEach((q) => add(inside, q));
  for (const p of outParts) terminalsOf(p, resolver).forEach((q) => add(outside, q));
  for (const w of outWires) w.points.forEach((q) => add(outside, q));
  for (const l of labels) add(outside, l.at);
  for (const q of extra) add(outside, q);
  // A point of one side lying inside a wire segment of the other joins that wire too.
  const innerExtra: Point[] = [];
  const outerExtra: Point[] = [];
  for (const w of [...inWires, ...outWires]) {
    const isIn = sel.has(w.id);
    const mine = isIn ? inside : outside;
    const other = isIn ? [...outside] : [...inside];
    for (let i = 0; i + 1 < w.points.length; i++)
      for (const [k, p] of other)
        if (strictlyInside(p, w.points[i], w.points[i + 1])) {
          mine.set(k, p);
          (isIn ? innerExtra : outerExtra).push(p);
        }
  }

  const full = new UnionFind();
  unionSheet(full, { parts: Object.values(d.parts), wires: Object.values(d.wires), netLabels: labels, extraAnchors: extra }, resolver);
  const innerUf = new UnionFind();
  unionSheet(innerUf, { parts: inParts, wires: inWires, netLabels: [], extraAnchors: innerExtra }, resolver);
  const outerUf = new UnionFind();
  unionSheet(outerUf, { parts: outParts, wires: outWires, netLabels: labels, extraAnchors: [...extra, ...outerExtra] }, resolver);

  // Nets that touch both sides need a pin.
  const nets = new Map<string, { inPts: Point[]; outPts: Point[] }>();
  const netOf = (k: string) => full.find(k);
  for (const [k, p] of inside) {
    const n = nets.get(netOf(k)) ?? { inPts: [], outPts: [] };
    n.inPts.push(p);
    nets.set(netOf(k), n);
  }
  for (const [k, p] of outside) {
    const n = nets.get(netOf(k));
    if (n) n.outPts.push(p);
  }
  const ground = full.find(netKey("GND"));

  const bbox = boxOf([...inside.values()]);
  const cx = (bbox.x0 + bbox.x1) / 2;
  const cy = (bbox.y0 + bbox.y1) / 2;
  const labelName = new Map<string, string>();
  for (const l of labels) if (!labelName.has(netOf(pointKey(l.at)))) labelName.set(netOf(pointKey(l.at)), l.name);

  const plans: PinPlan[] = [];
  const usedNames = new Set<string>();
  for (const [root, n] of nets) {
    if (!n.outPts.length) continue;
    const comps = groupBy(n.inPts, (p) => innerUf.find(pointKey(p)));
    // Inside ground symbols already reach ground everywhere.
    if (root === ground && [...comps.values()].every((pts) => pts.some((p) => innerUf.find(pointKey(p)) === innerUf.find(netKey("GND"))))) continue;
    const crossing = new Set(n.inPts.filter((p) => outside.has(pointKey(p))).map(pointKey));
    const compList = [...comps.values()];
    const firstComp = compList.find((pts) => pts.some((p) => crossing.has(pointKey(p)))) ?? compList[0];
    const inner = firstComp.find((p) => crossing.has(pointKey(p))) ?? firstComp[0];
    const outComps = groupBy(n.outPts, (p) => outerUf.find(pointKey(p)));
    const targets = [...outComps].map(([r, pts]) => ({
      root: r,
      point: pts.find((p) => crossing.has(pointKey(p))) ?? nearest(pts, { x: cx, y: cy }),
    }));
    let name = root === ground ? "GND" : (labelName.get(root) ?? `P${plans.length + 1}`);
    for (let k = 2; usedNames.has(name); k++) name = `${name.replace(/_\d+$/, "")}_${k}`;
    usedNames.add(name);
    const t = targets[0].point;
    const dx = t.x - cx;
    const dy = t.y - cy;
    const side: PinSide = Math.abs(dx) >= Math.abs(dy) ? (dx <= 0 ? "left" : "right") : dy < 0 ? "top" : "bottom";
    plans.push({
      name,
      side,
      inner,
      innerLabels: compList.length > 1 ? compList.map((pts) => pts[0]) : [],
      targets,
      order: side === "left" || side === "right" ? t.y : t.x,
    });
  }
  const SIDES: PinSide[] = ["left", "right", "top", "bottom"];
  const bySide = (a: PinPlan, b: PinPlan) => SIDES.indexOf(a.side) - SIDES.indexOf(b.side) || a.order - b.order;
  plans.sort(bySide);
  // The student's choices (EDT-34): names must stay distinct.
  const chosen = new Set<string>();
  plans.forEach((p, i) => {
    const o = opts.pins?.[i];
    if (o?.side) p.side = o.side;
    const want = o?.name?.trim();
    if (want && !chosen.has(want)) p.name = want;
    for (let k = 2; chosen.has(p.name); k++) p.name = `${p.name.replace(/_\d+$/, "")}_${k}`;
    chosen.add(p.name);
  });
  plans.sort((a, b) => SIDES.indexOf(a.side) - SIDES.indexOf(b.side));

  // The definition keeps the parts at their present coordinates.
  const defId = opts.newId("sc");
  const def: SubcircuitDefinition = {
    id: defId,
    name: opts.name,
    parts: Object.fromEntries(inParts.map((p) => [p.id, structuredClone(plain(p))])),
    wires: Object.fromEntries(inWires.map((w) => [w.id, structuredClone(plain(w))])),
    netLabels: {},
    pins: plans.map((p) => ({ name: p.name, at: { ...p.inner }, side: p.side })),
  };
  for (const p of plans) {
    for (const at of p.innerLabels) {
      const id = opts.newId("n");
      def.netLabels[id] = { id, name: `${p.name}~`, at: { ...at } };
    }
  }
  d.subcircuits[defId] = def;
  for (const p of inParts) delete d.parts[p.id];
  for (const w of inWires) delete d.wires[w.id];

  // Place the block where the selection was, clear of other nets.
  const layout = defaultLayout(plans);
  const pinLayout = encodeLayout(layout);
  const block = (at: Point): Part => ({
    id: "",
    type: SUBCIRCUIT_TYPE,
    label: opts.label,
    at,
    orientation: { rot: 0, flip: false },
    props: { definition: defId, pinLayout },
  });
  const top = plans.some((p) => p.side === "top");
  const base = { x: Math.round(bbox.x0), y: Math.round(bbox.y0) + (top ? 2 : 1) };
  const blocked = (pt: Point, net: string) => {
    const k = pointKey(pt);
    if (outside.has(k) && outerUf.find(k) !== net) return true;
    for (const w of outWires)
      for (let i = 0; i + 1 < w.points.length; i++)
        if (strictlyInside(pt, w.points[i], w.points[i + 1]) && outerUf.find(pointKey(w.points[i])) !== net) return true;
    return false;
  };
  let at = base;
  for (const off of spiral(12)) {
    const cand = { x: base.x + off.x, y: base.y + off.y };
    if (terminalsOf(block(cand), resolver).every((q, i) => !blocked(q, plans[i].targets[0].root))) {
      at = cand;
      break;
    }
  }
  const instId = opts.newId("p");
  const instance: Part = { ...block(at), id: instId };
  d.parts[instId] = instance;

  // Reconnect: a clear wire where one exists, else a pair of net labels.
  const terms = terminalsOf(instance, resolver);
  const taken = new Map<string, number>(); // new wire points -> pin index
  terms.forEach((p, i) => taken.set(pointKey(p), i));
  plans.forEach((plan, i) => {
    const from = terms[i];
    for (const tgt of plan.targets) {
      const route = findRoute(from, tgt.point, plan.side, (pt) => blocked(pt, tgt.root) || ((taken.get(pointKey(pt)) ?? i) !== i));
      if (route) {
        const id = opts.newId("w");
        d.wires[id] = { id, points: route };
        for (let s = 0; s + 1 < route.length; s++) for (const q of segmentPoints(route[s], route[s + 1])) taken.set(pointKey(q), i);
        continue;
      }
      const name = plan.name === "GND" ? "GND" : (labelName.get(netOf(pointKey(tgt.point))) ?? `${opts.label}.${plan.name}`);
      addLabel(d, opts.newId, name, from);
      if (!labels.some((l) => l.name === name && outerUf.find(pointKey(l.at)) === tgt.root)) addLabel(d, opts.newId, name, tgt.point);
    }
  });

  // Probes and sliders that pointed inside now point through the instance.
  const moved = new Set([...inParts.map((p) => p.id), ...inWires.map((w) => w.id)]);
  for (const probe of Object.values(d.probes)) {
    if (targets(probe.target).some((id) => moved.has(id))) probe.target = repath(probe.target, moved, instId);
  }
  for (const [sid, s] of Object.entries(d.sliders)) if (moved.has(s.part)) delete d.sliders[sid];

  return { ok: true, definition: defId, instance: instId, pins: plans.map((p) => ({ name: p.name, side: p.side })) };
}

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function addLabel(d: CircuitDocument, newId: (p: string) => string, name: string, at: Point): void {
  const id = newId("n");
  d.netLabels[id] = { id, name, at: { ...at } } satisfies NetLabel;
}

/** Ids a probe target refers to. */
export function targets(t: ProbeTarget): string[] {
  if (t.kind === "between") return [...targets(t.a), ...targets(t.b)];
  return "part" in t ? [t.part] : [t.wire];
}

function repath(t: ProbeTarget, moved: Set<string>, inst: string): ProbeTarget {
  if (t.kind === "between") return { ...t, a: repath(t.a, moved, inst), b: repath(t.b, moved, inst) };
  if ("part" in t) return moved.has(t.part) ? { ...t, part: `${inst}/${t.part}` } : t;
  return moved.has(t.wire) ? { ...t, wire: `${inst}/${t.wire}` } : t;
}

/** An axis-aligned route (straight, or one bend) whose every grid point is allowed. */
function findRoute(a: Point, b: Point, side: PinSide, blocked: (p: Point) => boolean): Point[] | undefined {
  if (a.x === b.x && a.y === b.y) return undefined;
  const horizontalFirst = side === "left" || side === "right";
  const options: Point[][] = [];
  if (a.x === b.x || a.y === b.y) options.push([a, b]);
  const h = { x: b.x, y: a.y };
  const v = { x: a.x, y: b.y };
  options.push(horizontalFirst ? [a, h, b] : [a, v, b], horizontalFirst ? [a, v, b] : [a, h, b]);
  for (const route of options) {
    const pts = route.flatMap((p, i) => (i === 0 ? [] : segmentPoints(route[i - 1], p)));
    const inner = pts.filter((p) => !(p.x === a.x && p.y === a.y) && !(p.x === b.x && p.y === b.y));
    if (inner.some(blocked)) continue;
    return route.filter((p, i) => i === 0 || p.x !== route[i - 1].x || p.y !== route[i - 1].y);
  }
  return undefined;
}

function* spiral(r: number): Generator<Point> {
  yield { x: 0, y: 0 };
  for (let k = 1; k <= r; k++) {
    for (let x = -k; x <= k; x++) for (const y of [-k, k]) yield { x, y };
    for (let y = -k + 1; y < k; y++) for (const x of [-k, k]) yield { x, y };
  }
}

function boxOf(pts: Point[]): { x0: number; y0: number; x1: number; y1: number } {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function nearest(pts: Point[], c: Point): Point {
  let best = pts[0];
  let bd = Infinity;
  for (const p of pts) {
    const dd = Math.abs(p.x - c.x) + Math.abs(p.y - c.y);
    if (dd < bd) {
      bd = dd;
      best = p;
    }
  }
  return best;
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

