import type { MessageRef, Part, Point } from "@cs/model";
import { formatValue, type Unit } from "@cs/units";
import type { Box, ElementView, LiveReadouts, SymbolGraphics } from "../api";
import { DEFAULT_LENGTH } from "./descriptorKit";
import { num } from "./props";

/** Distance between the two terminals of a stretchable part. */
export function lengthOf(part: Part): number {
  return part.length ?? DEFAULT_LENGTH;
}

export function line(g: SymbolGraphics, x0: number, y0: number, x1: number, y1: number): void {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke("symbol");
}

/** Leads from each terminal to a body of half-width `half` centred between them. */
export function leads(g: SymbolGraphics, part: Part, half: number): number {
  const L = lengthOf(part);
  const c = L / 2;
  line(g, 0, 0, c - half, 0);
  line(g, c + half, 0, L, 0);
  return c;
}

export function circle(g: SymbolGraphics, cx: number, cy: number, r: number): void {
  g.beginPath();
  g.arc(cx, cy, r, 0, 2 * Math.PI);
  g.closePath();
  g.stroke("symbol");
}

export function polyline(g: SymbolGraphics, pts: [number, number][], close = false): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  if (close) g.closePath();
}

export function straightPath(part: Part): { points: Point[]; from: number; to: number }[] {
  return [{ points: [{ x: 0, y: 0 }, { x: lengthOf(part), y: 0 }], from: 0, to: 1 }];
}

export function bodyBox(part: Part, halfHeight = 1): Box {
  return { x: 0, y: -halfHeight, w: lengthOf(part), h: 2 * halfHeight };
}

/** Box of the symbol body only (the clickable part of a switch). */
export function centreBox(part: Part, halfWidth: number, halfHeight: number): Box {
  const c = lengthOf(part) / 2;
  return { x: c - halfWidth, y: -halfHeight, w: 2 * halfWidth, h: 2 * halfHeight };
}

/**
 * Accessible description (ACC-07): key "element.<type>.describe" with the
 * label, the main value, and live voltage/current when running.
 */
export function describePart(part: Part, main?: { key: string; unit: Unit; fallback: number }, live?: LiveReadouts): MessageRef {
  const values: Record<string, string | number> = { label: part.label };
  if (main) values.value = formatValue(num(part.props, main.key, main.fallback), main.unit);
  if (live) {
    const v = live.get("voltage");
    const i = live.get("current");
    if (v !== undefined) values.voltage = formatValue(v, "V");
    if (i !== undefined) values.current = formatValue(i, "A");
  }
  return { key: `element.${part.type}.describe`, values };
}

/** Assemble a typical two-terminal view from a body-drawing function. */
export function twoTerminalView(
  drawBody: (g: SymbolGraphics, part: Part) => void,
  main?: { key: string; unit: Unit; fallback: number },
  extra: Partial<ElementView> = {},
): ElementView {
  return {
    drawSymbol: (g, part) => drawBody(g, part),
    currentPaths: straightPath,
    hitShape: (part) => bodyBox(part),
    describe: (part, live) => describePart(part, main, live),
    ...extra,
  };
}
