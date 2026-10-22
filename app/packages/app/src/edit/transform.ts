import type { CircuitDocument, Part, Point, Rotation } from "@cs/model";
import { getDescriptor, terminalPositions } from "@cs/elements";

/** Terminal positions of a part in document coordinates (from the element descriptor). */
export type TerminalsOf = (part: Part) => Point[];

export const terminalsOf: TerminalsOf = (p) => {
  const d = getDescriptor(p.type);
  return d ? terminalPositions(p, d) : [p.at];
};

const rot = (r: number): Rotation => ((((r % 360) + 360) % 360) as Rotation);

/** Points that define where the selection is: part terminals and wire vertices. */
function selectionPoints(doc: CircuitDocument, ids: readonly string[], terminals: TerminalsOf): Point[] {
  const pts: Point[] = [];
  for (const id of ids) {
    const p = doc.parts[id];
    if (p) {
      const t = terminals(p);
      pts.push(...(t.length ? t : [p.at]));
    }
    const w = doc.wires[id];
    if (w) pts.push(...w.points);
  }
  return pts;
}

/** Center of the selection's bounding box, rounded to the grid so rotated parts stay on it. */
export function selectionCenter(doc: CircuitDocument, ids: readonly string[], terminals: TerminalsOf): Point | undefined {
  const pts = selectionPoints(doc, ids, terminals);
  if (!pts.length) return undefined;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) };
}

/**
 * Rotate the selection 90° around its center (EDT-21). Screen y points down,
 * so clockwise maps an offset (dx, dy) to (-dy, dx).
 */
export function rotateSelection(draft: CircuitDocument, ids: readonly string[], terminals: TerminalsOf, cw: boolean): void {
  const c = selectionCenter(draft, ids, terminals);
  if (!c) return;
  const turn = (p: Point): Point => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return cw ? { x: c.x - dy + 0, y: c.y + dx + 0 } : { x: c.x + dy + 0, y: c.y - dx + 0 };
  };
  for (const id of ids) {
    const p = draft.parts[id];
    if (p) {
      p.at = turn(p.at);
      p.orientation = { ...p.orientation, rot: rot(p.orientation.rot + (cw ? 90 : 270)) };
    }
    const w = draft.wires[id];
    if (w) w.points = w.points.map(turn);
  }
}

/**
 * Mirror the selection about its center: horizontally (x → −x) or vertically.
 * With doc = R(rot)·F^flip·local and F·R(r)·F = R(−r), a vertical mirror gives
 * rot' = −rot and a horizontal one rot' = 180 − rot; both toggle flip.
 */
export function flipSelection(draft: CircuitDocument, ids: readonly string[], terminals: TerminalsOf, horizontal: boolean): void {
  const c = selectionCenter(draft, ids, terminals);
  if (!c) return;
  const mirror = (p: Point): Point => (horizontal ? { x: 2 * c.x - p.x + 0, y: p.y } : { x: p.x, y: 2 * c.y - p.y + 0 });
  for (const id of ids) {
    const p = draft.parts[id];
    if (p) {
      p.at = mirror(p.at);
      p.orientation = { flip: !p.orientation.flip, rot: rot(horizontal ? 180 - p.orientation.rot : -p.orientation.rot) };
    }
    const w = draft.wires[id];
    if (w) w.points = w.points.map(mirror);
  }
}

/** Move selected parts and wires by whole grid units (EDT-20). */
export function moveSelection(draft: CircuitDocument, ids: readonly string[], dx: number, dy: number): void {
  for (const id of ids) {
    const p = draft.parts[id];
    if (p) p.at = { x: p.at.x + dx, y: p.at.y + dy };
    const w = draft.wires[id];
    if (w) w.points = w.points.map((q) => ({ x: q.x + dx, y: q.y + dy }));
  }
}
