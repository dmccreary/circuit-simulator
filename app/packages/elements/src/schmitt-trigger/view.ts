import type { Part } from "@cs/model";
import type { ElementView, SymbolGraphics } from "../api";
import { bubble } from "../logic/symbols";
import { describePart, lengthOf, line, polyline } from "../shared/viewKit";

/** The hysteresis loop glyph centred at (cx, cy). */
function loop(g: SymbolGraphics, cx: number, cy: number): void {
  polyline(g, [[cx - 0.35, cy + 0.2], [cx + 0.15, cy + 0.2], [cx + 0.15, cy - 0.2], [cx + 0.35, cy - 0.2]]);
  g.stroke("symbol");
  polyline(g, [[cx - 0.35, cy + 0.2], [cx - 0.15, cy + 0.2], [cx - 0.15, cy - 0.2], [cx + 0.35, cy - 0.2]]);
  g.stroke("symbol");
}

/** A buffer triangle with the hysteresis glyph, plus a bubble when inverting. */
function makeView(inverting: boolean): ElementView {
  return {
    drawSymbol(g, part: Part) {
      const L = lengthOf(part);
      const c = L / 2;
      const x0 = c - 1;
      const x1 = c + 0.9;
      line(g, 0, 0, x0, 0);
      polyline(g, [[x0, -1], [x0, 1], [x1, 0]], true);
      g.stroke("symbol");
      loop(g, x0 + 0.65, 0);
      const end = inverting ? bubble(g, x1, 0) : x1;
      line(g, end, 0, L, 0);
    },
    currentPaths: () => [],
    hitShape: (part) => ({ x: 0, y: -1.1, w: lengthOf(part), h: 2.2 }),
    describe: (part, live) => describePart(part, undefined, live),
  };
}

export const schmittView = makeView(false);
export const invertingSchmittView = makeView(true);
