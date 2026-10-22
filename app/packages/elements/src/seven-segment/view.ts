import type { Part } from "@cs/model";
import type { ElementView, SymbolGraphics } from "../api";
import { num } from "../shared/props";
import { describePart, line } from "../shared/viewKit";
import { drawBox, pinLabel } from "../logic/symbols";
import { SEGMENT_PINS } from "./descriptor";

/** Segment ends in a 2×4 digit at (4.5..6.5, 1..5): a top, b/c right, d bottom, e/f left, g middle (SevenSegElm display7). */
const SEGMENTS: [number, number, number, number][] = [
  [0, 0, 2, 0],
  [2, 0, 2, 1],
  [2, 1, 2, 2],
  [0, 2, 2, 2],
  [0, 1, 0, 2],
  [0, 0, 0, 1],
  [0, 1, 2, 1],
];
const X0 = 4.5;
const Y0 = 1;
const SX = 1.5;
const SY = 2;

function segment(g: SymbolGraphics, i: number): void {
  const [x1, y1, x2, y2] = SEGMENTS[i];
  line(g, X0 + x1 * SX, Y0 + y1 * SY, X0 + x2 * SX, Y0 + y2 * SY);
}

export const sevenSegmentView: ElementView = {
  drawSymbol(g) {
    drawBox(g, 1, -1, 9, 7);
    SEGMENT_PINS.forEach((p, i) => {
      const name = String.fromCharCode(97 + i);
      if (p.x === 0) {
        line(g, 0, p.y, 1, p.y);
        pinLabel(g, name, 1.15, p.y);
      } else {
        line(g, p.x, 7, p.x, 8);
        pinLabel(g, name, p.x, 6.5, "center");
      }
    });
    for (let i = 0; i < 7; i++) segment(g, i);
  },
  drawLive(g, part: Part, live) {
    const th = num(part.props, "threshold", 2.5);
    for (let i = 0; i < 7; i++) {
      if ((live.terminalVoltages[i] ?? 0) <= th) continue;
      const [x1, y1, x2, y2] = SEGMENTS[i];
      g.beginPath();
      g.moveTo(X0 + x1 * SX, Y0 + y1 * SY);
      g.lineTo(X0 + x2 * SX, Y0 + y2 * SY);
      g.stroke("glow", 0.35);
    }
  },
  currentPaths: () => [],
  hitShape: () => ({ x: 0, y: -1, w: 9, h: 9 }),
  describe: (part, live) => describePart(part, undefined, live),
};
