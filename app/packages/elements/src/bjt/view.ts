import type { Point } from "@cs/model";
import type { ElementView, SymbolGraphics } from "../api";
import { circle, describePart, line, polyline } from "../shared/viewKit";
import { shiftPoint, shiftX, stretchOf } from "../shared/stretch";
import { BJT_LENGTH } from "./descriptor";

/** Filled arrowhead with its tip at `tip`, pointing away from `from`. */
export function arrowHead(g: SymbolGraphics, from: [number, number], tip: [number, number], size = 0.3): void {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = tip[0] - ux * size;
  const by = tip[1] - uy * size;
  const w = size * 0.55;
  polyline(g, [tip, [bx - uy * w, by + ux * w], [bx + uy * w, by - ux * w]], true);
  g.fill("symbol");
}

const BAR_X = BJT_LENGTH - 1;
const LEG = 0.35;

/**
 * Base bar one unit before the collector/emitter column; collector and emitter legs run diagonally to their
 * terminals. The emitter arrow points out of the bar for NPN, into it for PNP.
 */
function bjtView(pnp: boolean): ElementView {
  const s = pnp ? -1 : 1; // collector side: -s
  const L = BJT_LENGTH;
  const C: Point = { x: L, y: -s };
  const E: Point = { x: L, y: s };
  // Imported at another Falstad size, the body stays at the collector/emitter
  // column and the base lead stretches (CircuitJS1 TransistorElm).
  return {
    drawSymbol(g0, part) {
      const e = stretchOf(part, L);
      line(g0, 0, 0, BAR_X + e, 0);
      const g = shiftX(g0, e);
      line(g, BAR_X, -0.6, BAR_X, 0.6);
      line(g, BAR_X, -s * LEG, C.x, C.y);
      line(g, BAR_X, s * LEG, E.x, E.y);
      const mid: [number, number] = [(BAR_X + E.x) / 2 + 0.1, (s * LEG + E.y) / 2 + s * 0.07];
      if (pnp) arrowHead(g, [E.x, E.y], [BAR_X + 0.15, s * (LEG + 0.1)]);
      else arrowHead(g, [BAR_X, s * LEG], mid);
      circle(g, BAR_X + 0.25, 0, 1.05);
    },
    currentPaths: (part) => {
      const e = stretchOf(part, L);
      const sh = (p: Point) => shiftPoint(p, e);
      return [
        { points: [C, { x: BAR_X, y: -s * LEG }, { x: BAR_X, y: s * LEG }, E].map(sh), from: 1, to: 2 },
        { points: [{ x: 0, y: 0 }, ...[{ x: BAR_X, y: 0 }, { x: BAR_X, y: s * LEG }, E].map(sh)], from: 0, to: 2 },
      ];
    },
    hitShape: (part) => ({ x: 0, y: -1.2, w: Math.max(1, L + stretchOf(part, L) + 0.4), h: 2.4 }),
    describe: (part, live) => describePart(part, { key: "beta", unit: "", fallback: 100 }, live),
  };
}

export const npnView = bjtView(false);
export const pnpView = bjtView(true);
