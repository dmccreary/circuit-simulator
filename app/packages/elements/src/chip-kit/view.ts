// Generic chip symbol (CircuitJS1 ChipElm.drawChip): a box, a lead per pin,
// pin names inside the box, clock wedges, inversion bubbles, and the title.

import type { Part } from "@cs/model";
import type { ElementView, LiveReadouts, SymbolGraphics } from "../api";
import { circle, line } from "../shared/viewKit";
import { clockWedge, describeLogic, drawBox, pinLabel } from "../logic/symbols";
import { chipFramePos, chipOrigin, chipPostPos, CHIP_PITCH, type ChipPin, type ChipSpec } from "./layout";

/** A SymbolGraphics that draws in the chip frame (slot W0 at the origin) on a part whose origin is terminal 0. */
export function chipFrame(g: SymbolGraphics, spec: ChipSpec): SymbolGraphics {
  const o = chipOrigin(spec);
  return {
    beginPath: () => g.beginPath(),
    moveTo: (x, y) => g.moveTo(x - o.x, y - o.y),
    lineTo: (x, y) => g.lineTo(x - o.x, y - o.y),
    arc: (cx, cy, r, a0, a1, ccw) => g.arc(cx - o.x, cy - o.y, r, a0, a1, ccw),
    closePath: () => g.closePath(),
    stroke: (c, w) => g.stroke(c, w),
    fill: (c, a) => g.fill(c, a),
    text: (s, x, y, st) => g.text(s, x - o.x, y - o.y, st),
  };
}

/** Box corners in the chip frame. */
export function chipBox(spec: ChipSpec): { x0: number; y0: number; x1: number; y1: number } {
  const k = CHIP_PITCH;
  return { x0: k / 2, y0: -k / 2, x1: k * spec.sizeX + k / 2, y1: k * spec.sizeY - k / 2 };
}

const overline = (s: string) => [...s].map((c) => c + "̅").join("");

function drawPin(g: SymbolGraphics, spec: ChipSpec, p: ChipPin): void {
  if (p.at) {
    // A bus bit: a dot on its terminal inside the box; the bus lead is drawn once, with bit 0's name.
    circle(g, p.at.x, p.at.y, 0.12);
    if (!p.name) return;
  }
  const q = chipPostPos(spec, p);
  const b = chipBox(spec);
  // Edge point on the box and the direction into the box.
  const [ex, ey, ix, iy] =
    p.side === "W" ? [b.x0, q.y, 1, 0] : p.side === "E" ? [b.x1, q.y, -1, 0] : p.side === "N" ? [q.x, b.y0, 0, 1] : [q.x, b.y1, 0, -1];
  if (p.bubble) {
    const r = 0.2;
    line(g, q.x, q.y, ex - ix * 2 * r, ey - iy * 2 * r);
    circle(g, ex - ix * r, ey - iy * r, r);
  } else line(g, q.x, q.y, ex, ey);
  let inset = 0.15;
  if (p.clock) {
    if (p.side === "W") clockWedge(g, ex, ey);
    else {
      // Wedge pointing into the box from the other sides.
      g.beginPath();
      g.moveTo(ex - iy * 0.3, ey - ix * 0.3);
      g.lineTo(ex + ix * 0.35, ey + iy * 0.35);
      g.lineTo(ex + iy * 0.3, ey + ix * 0.3);
      g.stroke("symbol");
    }
    inset = 0.5;
  }
  if (!p.name) return;
  const text = p.bar ? overline(p.name) : p.name;
  if (p.side === "W") pinLabel(g, text, ex + inset, ey);
  else if (p.side === "E") pinLabel(g, text, ex - inset, ey, "right");
  else pinLabel(g, text, ex, ey + iy * (inset + 0.25), "center");
}

/** Static symbol of a chip in its part's local frame. */
export function drawChip(g0: SymbolGraphics, spec: ChipSpec, title = true): void {
  const g = chipFrame(g0, spec);
  const b = chipBox(spec);
  drawBox(g, b.x0, b.y0, b.x1, b.y1);
  for (const p of spec.pins) drawPin(g, spec, p);
  if (title && spec.title) {
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    g.text(spec.title, cx, cy, { size: 0.55, align: "center", baseline: "middle", color: "label" });
  }
}

/** Hit box of a chip, leads included, in the part's local frame. */
export function chipHitShape(spec: ChipSpec): { x: number; y: number; w: number; h: number } {
  const o = chipOrigin(spec);
  const b = chipBox(spec);
  const pts = spec.pins.flatMap((p) => [chipFramePos(spec, p), chipPostPos(spec, p)]);
  const xs = [b.x0, b.x1, ...pts.map((p) => p.x)];
  const ys = [b.y0, b.y1, ...pts.map((p) => p.y)];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x: x - o.x, y: y - o.y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** View of one chip variant; `live` draws extra state in the chip frame. */
export function chipView(
  spec: ChipSpec,
  live?: (g: SymbolGraphics, part: Part, readouts: LiveReadouts) => void,
  showTitle = true,
): ElementView {
  return {
    drawSymbol: (g) => drawChip(g, spec, showTitle),
    drawLive: live ? (g, part, r) => live(chipFrame(g, spec), part, r) : undefined,
    currentPaths: () => [],
    hitShape: () => chipHitShape(spec),
    describe: (part) => describeLogic(part),
  };
}
