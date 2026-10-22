import type { Part, Point } from "@cs/model";
import type { ElementDescriptor } from "./api";

/**
 * Local symbol frame -> document grid: mirror y if flipped, then rotate
 * clockwise on screen (y points down), then translate to part.at.
 */
export function localToDocument(part: Part, p: Point): Point {
  const y0 = part.orientation.flip ? -p.y : p.y;
  let x = p.x;
  let y = y0;
  switch (part.orientation.rot) {
    case 90:
      x = -y0;
      y = p.x;
      break;
    case 180:
      x = -p.x;
      y = -y0;
      break;
    case 270:
      x = y0;
      y = -p.x;
      break;
  }
  // "+ 0" turns -0 into 0 so positions compare and serialize cleanly.
  return { x: part.at.x + x + 0, y: part.at.y + y + 0 };
}

/** Terminal positions in the local frame, honouring part.length for stretchable parts. */
export function localTerminals(part: Part, d: ElementDescriptor): Point[] {
  const moving = d.stretchable?.terminals;
  if (d.stretchable && moving) {
    const dx = (part.length ?? d.stretchable.default) - d.stretchable.default;
    const mid = d.stretchable.midTerminals ?? [];
    const shift = (i: number) => (moving.includes(i) ? dx : mid.includes(i) ? Math.floor(dx / 2) : 0);
    return d.terminals.map((t, i) => ({ x: t.at.x + shift(i), y: t.at.y }));
  }
  return d.terminals.map((t, i) =>
    d.stretchable && i === 1 ? { x: part.length ?? d.stretchable.default, y: 0 } : { x: t.at.x, y: t.at.y },
  );
}

export function terminalPositions(part: Part, d: ElementDescriptor): Point[] {
  return localTerminals(part, d).map((p) => localToDocument(part, p));
}
