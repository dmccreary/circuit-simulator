import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { drawZigzag } from "../resistor/view";
import { stretchOf } from "../shared/stretch";
import { describePart, line, polyline } from "../shared/viewKit";
import { POT_WIPER } from "./descriptor";

/** Length and wiper x; longer imported pots keep the 2-unit zigzag centred under the wiper. */
function geometry(part: Part): { L: number; wx: number } {
  const e = stretchOf(part, 4);
  return { L: 4 + e, wx: POT_WIPER.x + Math.floor(e / 2) };
}

export const potentiometerView: ElementView = {
  drawSymbol(g, part) {
    const { L, wx } = geometry(part);
    line(g, 0, 0, wx - 1, 0);
    drawZigzag(g, wx - 1, wx + 1);
    line(g, wx + 1, 0, L, 0);
    // Wiper lead from its terminal down to an arrowhead touching the zigzag.
    line(g, wx, POT_WIPER.y, wx, -0.85);
    polyline(g, [
      [wx, -0.45],
      [wx - 0.25, -0.9],
      [wx + 0.25, -0.9],
    ], true);
    g.fill("symbol");
  },
  currentPaths: (part) => {
    const { L, wx } = geometry(part);
    const W = { x: wx, y: POT_WIPER.y };
    return [
      { points: [{ x: 0, y: 0 }, { x: wx, y: 0 }, W], from: 0, to: 2 },
      { points: [{ x: L, y: 0 }, { x: wx, y: 0 }, W], from: 1, to: 2 },
    ];
  },
  controls: (part) => {
    const { wx } = geometry(part);
    return [{ id: "wiper", shape: { x: wx - 1.5, y: -1, w: 3, h: 1.6 } }];
  },
  hitShape: (part) => ({ x: 0, y: -2, w: geometry(part).L, h: 2.6 }),
  describe: (part, live) => {
    const ref = describePart(part, { key: "resistance", unit: "ohm", fallback: 10000 }, live);
    const pos = part.props.position;
    ref.values!.position = Math.round((typeof pos === "number" ? pos : 0.5) * 100);
    return ref;
  },
};
