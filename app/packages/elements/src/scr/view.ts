import type { Part, Point } from "@cs/model";
import type { ElementView, SymbolGraphics } from "../api";
import { describePart, line, polyline } from "../shared/viewKit";
import { THYRISTOR_LENGTH } from "./descriptor";

export const thyristorLength = (part: Part): number => part.length ?? THYRISTOR_LENGTH;
/** Gate terminal x: L/2 + 2, moved by half the stretch (rounded down) like the descriptor's midTerminals. */
export const gateX = (part: Part): number => THYRISTOR_LENGTH / 2 + 2 + Math.floor((thyristorLength(part) - THYRISTOR_LENGTH) / 2);

/** Axis leads, a body drawn by `body` at the centre, and the gate lead from the body to (gateX, 2). */
export function thyristorView(body: (g: SymbolGraphics, c: number) => void, gateFrom: number): ElementView {
  return {
    drawSymbol(g, part) {
      const L = thyristorLength(part);
      const c = L / 2;
      line(g, 0, 0, c - 0.5, 0);
      line(g, c + 0.5, 0, L, 0);
      body(g, c);
      const gx = gateX(part);
      polyline(g, [[c + gateFrom, 0.55], [gx, 1.2], [gx, 2]]);
      g.stroke("symbol");
    },
    currentPaths: (part) => {
      const L = thyristorLength(part);
      const c = L / 2;
      const gx = gateX(part);
      const pts = (...p: [number, number][]): Point[] => p.map(([x, y]) => ({ x, y }));
      return [
        { points: pts([0, 0], [L, 0]), from: 0, to: 1 },
        { points: pts([gx, 2], [gx, 1.2], [c + gateFrom, 0.55], [c + 0.5, 0], [L, 0]), from: 2, to: 1 },
      ];
    },
    hitShape: (part) => ({ x: 0, y: -1, w: thyristorLength(part), h: 3 }),
    describe: (part, live) => describePart(part, undefined, live),
  };
}

/** Diode triangle and cathode bar with the gate leaving the bar. */
export const scrView = thyristorView((g, c) => {
  polyline(g, [
    [c - 0.5, -0.6],
    [c + 0.5, 0],
    [c - 0.5, 0.6],
  ], true);
  g.stroke("symbol");
  line(g, c - 0.5, 0, c + 0.5, 0);
  line(g, c + 0.5, -0.6, c + 0.5, 0.6);
}, 0.5);
