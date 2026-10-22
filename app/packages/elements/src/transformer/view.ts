import type { Part, Point } from "@cs/model";
import type { ElementView, SymbolGraphics } from "../api";
import { bool } from "../shared/props";
import { describePart, line } from "../shared/viewKit";
import { TRANSFORMER_HEIGHT, TRANSFORMER_LENGTH } from "./descriptor";

const L = TRANSFORMER_LENGTH;
const H = TRANSFORMER_HEIGHT;
const R = H / 8; // four humps per winding
const COIL1 = L / 2 - 0.75;
const COIL2 = L / 2 + 0.75;

/** A vertical winding at x, bulging right (dir 1) or left (dir -1). */
function winding(g: SymbolGraphics, x: number, dir: 1 | -1): void {
  g.beginPath();
  g.moveTo(x, 0);
  for (let k = 0; k < 4; k++) {
    const cy = R + 2 * R * k;
    if (dir === 1) g.arc(x, cy, R, -Math.PI / 2, Math.PI / 2, false);
    else g.arc(x, cy, R, -Math.PI / 2, Math.PI / 2, true);
  }
  g.stroke("symbol");
}

function dot(g: SymbolGraphics, x: number, y: number): void {
  g.beginPath();
  g.arc(x, y, 0.12, 0, 2 * Math.PI);
  g.closePath();
  g.fill("symbol");
}

/** Two windings either side of a two-line core; dots mark the in-phase ends. */
export const transformerView: ElementView = {
  drawSymbol(g, part: Part) {
    line(g, 0, 0, COIL1, 0);
    line(g, 0, H, COIL1, H);
    line(g, COIL2, 0, L, 0);
    line(g, COIL2, H, L, H);
    winding(g, COIL1, 1);
    winding(g, COIL2, -1);
    line(g, L / 2 - 0.12, 0, L / 2 - 0.12, H);
    line(g, L / 2 + 0.12, 0, L / 2 + 0.12, H);
    dot(g, COIL1 - 0.35, 0.3);
    dot(g, COIL2 + 0.35, bool(part.props, "reversePolarity", false) ? H - 0.3 : 0.3);
  },
  currentPaths: () => {
    const path = (x: number, x0: number): Point[] => [{ x: x0, y: 0 }, { x, y: 0 }, { x, y: H }, { x: x0, y: H }];
    return [
      { points: path(COIL1, 0), from: 0, to: 1 },
      { points: path(COIL2, L), from: 2, to: 3 },
    ];
  },
  hitShape: () => ({ x: 0, y: -0.3, w: L, h: H + 0.6 }),
  describe: (part, live) => describePart(part, { key: "ratio", unit: "", fallback: 1 }, live),
};
