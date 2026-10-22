// The block symbol of a subcircuit instance (EDT-34, circuit-model.md §6).
// The layout follows CircuitJS1's ChipElm so imported Falstad subcircuits keep
// their pin positions: pins sit two grid units apart, left pins at x = 0, and
// the body spans x 1..1+2·sizeX, y -1..-1+2·sizeY in the part's local frame.
//
// An instance stores its layout in `props.pinLayout` (PropValue is scalar, so
// it is a short string), which keeps terminal geometry a pure function of the
// part: the renderer, hit testing and the compiler need no document lookup.

import type { Point, SubcircuitDefinition } from "../types";

export type PinSide = "left" | "right" | "top" | "bottom";

export interface BlockPin {
  name: string;
  side: PinSide;
  /** Slot along the side, from the top (left/right) or the left (top/bottom). */
  pos: number;
}

export interface BlockLayout {
  sizeX: number;
  sizeY: number;
  pins: BlockPin[];
}

const SIDE_CODE: Record<PinSide, string> = { left: "L", right: "R", top: "T", bottom: "B" };
const CODE_SIDE: Record<string, PinSide> = { L: "left", R: "right", T: "top", B: "bottom" };

/** Pins in definition order, each given the next free slot on its side. */
export function defaultLayout(pins: readonly { name: string; side: PinSide }[]): BlockLayout {
  const next: Record<PinSide, number> = { left: 0, right: 0, top: 0, bottom: 0 };
  const out = pins.map((p) => ({ name: p.name, side: p.side, pos: next[p.side]++ }));
  return { sizeX: Math.max(next.top, next.bottom, 2), sizeY: Math.max(next.left, next.right, 1), pins: out };
}

export const layoutOf = (def: Pick<SubcircuitDefinition, "pins">): BlockLayout => defaultLayout(def.pins);

/** "sizeX,sizeY;L0:name;R0:name" with names URI-encoded. */
export function encodeLayout(l: BlockLayout): string {
  return [`${l.sizeX},${l.sizeY}`, ...l.pins.map((p) => `${SIDE_CODE[p.side]}${p.pos}:${encodeURIComponent(p.name)}`)].join(";");
}

export function decodeLayout(s: unknown): BlockLayout {
  const empty: BlockLayout = { sizeX: 2, sizeY: 1, pins: [] };
  if (typeof s !== "string" || !s) return empty;
  const [size, ...rest] = s.split(";");
  const [sx, sy] = size.split(",").map((v) => parseInt(v, 10));
  const pins: BlockPin[] = [];
  for (const item of rest) {
    const m = /^([LRTB])(\d+):(.*)$/.exec(item);
    if (!m) continue;
    let name = m[3];
    try {
      name = decodeURIComponent(name);
    } catch {
      // keep the raw text
    }
    pins.push({ name, side: CODE_SIDE[m[1]], pos: parseInt(m[2], 10) });
  }
  return { sizeX: sx > 0 ? sx : 2, sizeY: sy > 0 ? sy : 1, pins };
}

/** Terminal position of a pin in the part's local frame. */
export function pinPoint(l: BlockLayout, p: BlockPin): Point {
  switch (p.side) {
    case "left":
      return { x: 0, y: 2 * p.pos };
    case "right":
      return { x: 2 + 2 * l.sizeX, y: 2 * p.pos };
    case "top":
      return { x: 2 + 2 * p.pos, y: -2 };
    case "bottom":
      return { x: 2 + 2 * p.pos, y: 2 * l.sizeY };
  }
}

/** The body rectangle in the local frame. */
export function blockBody(l: BlockLayout): { x: number; y: number; w: number; h: number } {
  return { x: 1, y: -1, w: 2 * l.sizeX, h: 2 * l.sizeY };
}

/** Local terminal positions, in pin (terminal) order. */
export function layoutTerminals(l: BlockLayout): Point[] {
  return l.pins.map((p) => pinPoint(l, p));
}
