import type { Point } from "@cs/model";
import type { ElementView, SymbolGraphics } from "../api";
import { arrowHead } from "../bjt/view";
import { describePart, line, polyline } from "../shared/viewKit";
import { CS_HEIGHT, CS_WIDTH } from "./descriptor";

const W = CS_WIDTH;
const H = CS_HEIGHT;
const MID = H / 2;
const DX = W - 1; // diamond centre x
const SENSE_X = 0.8;

/** Diamond source on the output side; the control side is either a +/- sense pair or a sensing wire. */
function controlledView(currentControlled: boolean, currentOutput: boolean): ElementView {
  const out: Point[] = [{ x: W, y: 0 }, { x: DX, y: 0 }, { x: DX, y: H }, { x: W, y: H }];
  const sense: Point[] = [{ x: 0, y: 0 }, { x: SENSE_X, y: 0 }, { x: SENSE_X, y: H }, { x: 0, y: H }];
  return {
    drawSymbol(g: SymbolGraphics) {
      polyline(g, [[W, 0], [DX, 0], [DX, MID - 0.8]]);
      g.stroke("symbol");
      polyline(g, [[W, H], [DX, H], [DX, MID + 0.8]]);
      g.stroke("symbol");
      polyline(g, [[DX, MID - 0.8], [DX + 0.8, MID], [DX, MID + 0.8], [DX - 0.8, MID]], true);
      g.stroke("symbol");
      if (currentOutput) {
        line(g, DX, MID - 0.45, DX, MID + 0.2);
        arrowHead(g, [DX, MID - 0.45], [DX, MID + 0.45], 0.25);
      } else {
        g.text("+", DX, MID - 0.35, { align: "center", baseline: "middle", size: 0.5 });
        g.text("−", DX, MID + 0.35, { align: "center", baseline: "middle", size: 0.5 });
      }
      if (currentControlled) {
        polyline(g, sense.map((p) => [p.x, p.y] as [number, number]));
        g.stroke("symbol");
        arrowHead(g, [SENSE_X, MID - 0.4], [SENSE_X, MID + 0.2], 0.25);
      } else {
        line(g, 0, 0, SENSE_X, 0);
        line(g, 0, H, SENSE_X, H);
        g.text("+", SENSE_X + 0.3, 0, { align: "center", baseline: "middle", size: 0.5 });
        g.text("−", SENSE_X + 0.3, H, { align: "center", baseline: "middle", size: 0.5 });
      }
    },
    currentPaths: () => [
      ...(currentControlled ? [{ points: sense, from: 0, to: 1 }] : []),
      { points: out, from: 2, to: 3 },
    ],
    hitShape: () => ({ x: 0, y: -0.3, w: W, h: H + 0.6 }),
    describe: (part, live) => describePart(part, { key: "gain", unit: currentControlled && !currentOutput ? "ohm" : "", fallback: 1 }, live),
  };
}

export const vcvsView = controlledView(false, false);
export const vccsView = controlledView(false, true);
export const ccvsView = controlledView(true, false);
export const cccsView = controlledView(true, true);
