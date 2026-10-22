import type { CircuitDocument, Part, Point } from "@cs/model";

/** The keyboard focus cursor on the canvas, separate from the selection (ACC-03). */
export type FocusTarget =
  | { kind: "part"; id: string }
  | { kind: "wire"; id: string }
  | { kind: "terminal"; part: string; terminal: number };

export type Direction = "left" | "right" | "up" | "down";

export interface FocusGeometry {
  doc: CircuitDocument;
  terminals(part: Part): Point[];
}

const DIRS: Record<Direction, Point> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export function sameTarget(a: FocusTarget | undefined, b: FocusTarget | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.kind === "terminal" && b.kind === "terminal") return a.part === b.part && a.terminal === b.terminal;
  return a.kind === b.kind && (a as { id: string }).id === (b as { id: string }).id;
}

/** The part a target belongs to, if any. */
export function targetPart(t: FocusTarget | undefined): string | undefined {
  return t?.kind === "part" ? t.id : t?.kind === "terminal" ? t.part : undefined;
}

/** Whether the target still exists in the document. */
export function targetExists(g: FocusGeometry, t: FocusTarget): boolean {
  if (t.kind === "wire") return !!g.doc.wires[t.id];
  const p = g.doc.parts[targetPart(t)!];
  return !!p && (t.kind === "part" || t.terminal < g.terminals(p).length);
}

/** Center of a part's terminals (or its anchor), a wire's middle, or a terminal's point. */
export function anchorOf(g: FocusGeometry, t: FocusTarget): Point | undefined {
  if (t.kind === "wire") {
    const w = g.doc.wires[t.id];
    if (!w) return undefined;
    const xs = w.points.map((p) => p.x);
    const ys = w.points.map((p) => p.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }
  const p = g.doc.parts[targetPart(t)!];
  if (!p) return undefined;
  const ts = g.terminals(p);
  if (t.kind === "terminal") return ts[t.terminal];
  if (!ts.length) return p.at;
  return { x: ts.reduce((s, q) => s + q.x, 0) / ts.length, y: ts.reduce((s, q) => s + q.y, 0) / ts.length };
}

/** Parts in reading order: top to bottom, then left to right (ACC-03). */
export function readingOrder(g: FocusGeometry): string[] {
  const rows = Object.values(g.doc.parts).map((p) => {
    const a = anchorOf(g, { kind: "part", id: p.id }) ?? p.at;
    return { id: p.id, x: a.x, y: a.y };
  });
  // Parts within half a grid row of each other read as one row.
  rows.sort((a, b) => (Math.abs(a.y - b.y) > 0.5 ? a.y - b.y : a.x - b.x || a.id.localeCompare(b.id)));
  return rows.map((r) => r.id);
}

/** Tab / Shift+Tab: the next part in reading order, or undefined past either end. */
export function stepPart(g: FocusGeometry, cur: FocusTarget | undefined, delta: 1 | -1): FocusTarget | undefined {
  const order = readingOrder(g);
  if (!order.length) return undefined;
  const at = cur ? order.indexOf(targetPart(cur) ?? "") : -1;
  if (at < 0 && cur?.kind === "wire") {
    // From a wire, continue with the parts before or after its middle in reading order.
    const a = anchorOf(g, cur);
    const key = (id: string) => anchorOf(g, { kind: "part", id })!;
    const after = (p: Point) => !!a && (p.y > a.y + 0.5 || (Math.abs(p.y - a.y) <= 0.5 && p.x > a.x));
    const id = delta > 0 ? order.find((o) => after(key(o))) : [...order].reverse().find((o) => !after(key(o)));
    return id ? { kind: "part", id } : undefined;
  }
  if (at < 0) return { kind: "part", id: delta > 0 ? order[0] : order[order.length - 1] };
  const next = order[at + delta];
  return next ? { kind: "part", id: next } : undefined;
}

/** `[` and `]`: cycle the focused part's terminals; from the part itself, start at terminal 0. */
export function cycleTerminal(g: FocusGeometry, cur: FocusTarget | undefined, delta: 1 | -1): FocusTarget | undefined {
  const id = targetPart(cur);
  const p = id ? g.doc.parts[id] : undefined;
  if (!p) return undefined;
  const n = g.terminals(p).length;
  if (!n) return cur;
  if (cur?.kind !== "terminal") return { kind: "terminal", part: p.id, terminal: delta > 0 ? 0 : n - 1 };
  return { kind: "terminal", part: p.id, terminal: (cur.terminal + delta + n) % n };
}

function pointsOf(g: FocusGeometry, t: FocusTarget): Point[] {
  if (t.kind === "wire") return g.doc.wires[t.id]?.points ?? [];
  const p = g.doc.parts[targetPart(t)!];
  if (!p) return [];
  const ts = g.terminals(p);
  return t.kind === "terminal" ? (ts[t.terminal] ? [ts[t.terminal]] : []) : ts;
}

function onSegment(p: Point, a: Point, b: Point): boolean {
  if (a.x === b.x) return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y) return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  return same(p, a) || same(p, b);
}

const touchesWire = (pts: Point[], w: Point[]) => pts.some((p) => w.some((q, i) => i + 1 < w.length && onSegment(p, q, w[i + 1])));

/** Items electrically touching the target: wires through its points and parts sharing a terminal. */
export function connectedItems(g: FocusGeometry, t: FocusTarget): FocusTarget[] {
  const mine = pointsOf(g, t);
  const self = targetPart(t);
  const out: FocusTarget[] = [];
  for (const w of Object.values(g.doc.wires)) {
    if (t.kind === "wire" && t.id === w.id) continue;
    if (touchesWire(mine, w.points) || (t.kind === "wire" && touchesWire(w.points, mine))) out.push({ kind: "wire", id: w.id });
  }
  for (const p of Object.values(g.doc.parts)) {
    if (p.id === self) continue;
    const ts = g.terminals(p);
    const hit = t.kind === "wire" ? touchesWire(ts, mine) : ts.some((q) => mine.some((m) => same(q, m)));
    if (hit) out.push({ kind: "part", id: p.id });
  }
  return out;
}

/**
 * Alt+arrow: the connected item that lies most nearly in that direction
 * (ACC-03). Items more than 60° off the direction are not candidates.
 */
export function neighbor(g: FocusGeometry, cur: FocusTarget, dir: Direction): FocusTarget | undefined {
  const from = anchorOf(g, cur);
  if (!from) return undefined;
  const d = DIRS[dir];
  let best: { t: FocusTarget; score: number } | undefined;
  for (const t of connectedItems(g, cur)) {
    const a = anchorOf(g, t);
    if (!a) continue;
    const vx = a.x - from.x;
    const vy = a.y - from.y;
    const len = Math.hypot(vx, vy);
    if (len === 0) continue;
    const cos = (vx * d.x + vy * d.y) / len;
    if (cos < 0.5) continue;
    const score = len * (2 - cos);
    if (!best || score < best.score) best = { t, score };
  }
  return best?.t;
}
