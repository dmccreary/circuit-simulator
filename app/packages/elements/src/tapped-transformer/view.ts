import type { Part, Point } from "@cs/model";
import type { ElementView, SymbolGraphics } from "../api";
import { stretchOf } from "../shared/stretch";
import { describePart, line } from "../shared/viewKit";
import { TAPPED_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => TAPPED_LENGTH + stretchOf(part, TAPPED_LENGTH);

/** A vertical winding of `humps` half-circles from (x, y0), bulging right (dir 1) or left. */
function winding(g: SymbolGraphics, x: number, y0: number, humps: number, r: number, dir: 1 | -1): void {
  g.beginPath();
  g.moveTo(x, y0);
  for (let k = 0; k < humps; k++) g.arc(x, y0 + r + 2 * r * k, r, -Math.PI / 2, Math.PI / 2, dir === -1);
  g.stroke("symbol");
}

/** Primary on the left, tapped secondary on the right, a two-line core between. */
export const tappedTransformerView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const c = L / 2;
    const x1 = c - 0.75;
    const x2 = c + 0.75;
    line(g, 0, 0, x1, 0);
    line(g, 0, 4, x1, 4);
    for (const y of [0, 2, 4]) line(g, x2, y, L, y);
    winding(g, x1, 0, 8, 0.25, 1);
    winding(g, x2, 0, 4, 0.25, -1);
    winding(g, x2, 2, 4, 0.25, -1);
    line(g, c - 0.12, 0, c - 0.12, 4);
    line(g, c + 0.12, 0, c + 0.12, 4);
  },
  currentPaths: (part) => {
    const L = lengthOf(part);
    const c = L / 2;
    const path = (x: number, x0: number, y0: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x, y: y0 }, { x, y: y1 }, { x: x0, y: y1 }];
    return [
      { points: path(c - 0.75, 0, 0, 4), from: 0, to: 1 },
      { points: path(c + 0.75, L, 0, 2), from: 2, to: 3 },
      { points: path(c + 0.75, L, 4, 2), from: 4, to: 3 }, // current into S2 is minus the lower half's
    ];
  },
  hitShape: (part) => ({ x: 0, y: -0.3, w: lengthOf(part), h: 4.6 }),
  describe: (part, live) => describePart(part, { key: "ratio", unit: "", fallback: 1 }, live),
};
