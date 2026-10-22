import type { Point } from "@cs/model";
import type { ElementView } from "../api";
import { arrowHead } from "../bjt/view";
import { describePart, line, polyline } from "../shared/viewKit";
import { shiftPoint, shiftX, stretchOf } from "../shared/stretch";
import { MOSFET_LENGTH } from "./descriptor";

const GATE_X = MOSFET_LENGTH - 1.2;
const CHAN_X = MOSFET_LENGTH - 0.85;
const LEG = 0.6;

/** Insulated gate plate, channel bar, drain and source legs; the body arrow points in for N, out for P. */
function mosfetView(pChannel: boolean): ElementView {
  const L = MOSFET_LENGTH;
  const D: Point = { x: L, y: -1 };
  const S: Point = { x: L, y: 1 };
  // Imported at another Falstad size, the gate lead stretches (CircuitJS1 MosfetElm).
  return {
    drawSymbol(g0, part) {
      const e = stretchOf(part, L);
      line(g0, 0, 0, GATE_X + e, 0);
      const g = shiftX(g0, e);
      line(g, GATE_X, -0.7, GATE_X, 0.7);
      line(g, CHAN_X, -0.85, CHAN_X, 0.85);
      polyline(g, [[CHAN_X, -LEG], [L, -LEG], [D.x, D.y]]);
      g.stroke("symbol");
      polyline(g, [[CHAN_X, LEG], [L, LEG], [S.x, S.y]]);
      g.stroke("symbol");
      // Body tied to the source.
      polyline(g, [[CHAN_X, 0], [L, 0], [L, LEG]]);
      g.stroke("symbol");
      if (pChannel) arrowHead(g, [CHAN_X, 0], [CHAN_X + 0.6, 0]);
      else arrowHead(g, [L, 0], [CHAN_X + 0.05, 0]);
    },
    currentPaths: (part) => [
      {
        points: [D, { x: L, y: -LEG }, { x: CHAN_X, y: -LEG }, { x: CHAN_X, y: LEG }, { x: L, y: LEG }, S].map((p) =>
          shiftPoint(p, stretchOf(part, L)),
        ),
        from: 1,
        to: 2,
      },
    ],
    hitShape: (part) => ({ x: 0, y: -1.2, w: Math.max(1, L + stretchOf(part, L) + 0.2), h: 2.4 }),
    describe: (part, live) => describePart(part, { key: "threshold", unit: "V", fallback: 1.5 }, live),
  };
}

export const nMosfetView = mosfetView(false);
export const pMosfetView = mosfetView(true);
