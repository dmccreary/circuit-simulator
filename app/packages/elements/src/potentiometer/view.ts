import type { ElementView } from "../api";
import { drawZigzag } from "../resistor/view";
import { describePart, line, polyline } from "../shared/viewKit";
import { POT_WIPER } from "./descriptor";

export const potentiometerView: ElementView = {
  drawSymbol(g) {
    line(g, 0, 0, 1, 0);
    drawZigzag(g, 1, 3);
    line(g, 3, 0, 4, 0);
    // Wiper lead from its terminal down to an arrowhead touching the zigzag.
    line(g, POT_WIPER.x, POT_WIPER.y, POT_WIPER.x, -0.85);
    polyline(g, [
      [POT_WIPER.x, -0.45],
      [POT_WIPER.x - 0.25, -0.9],
      [POT_WIPER.x + 0.25, -0.9],
    ], true);
    g.fill("symbol");
  },
  currentPaths: () => [
    { points: [{ x: 0, y: 0 }, { x: POT_WIPER.x, y: 0 }, POT_WIPER], from: 0, to: 2 },
    { points: [{ x: 4, y: 0 }, { x: POT_WIPER.x, y: 0 }, POT_WIPER], from: 1, to: 2 },
  ],
  controls: () => [{ id: "wiper", shape: { x: 0.5, y: -1, w: 3, h: 1.6 } }],
  hitShape: () => ({ x: 0, y: -2, w: 4, h: 2.6 }),
  describe: (part, live) => {
    const ref = describePart(part, { key: "resistance", unit: "ohm", fallback: 10000 }, live);
    const pos = part.props.position;
    ref.values!.position = Math.round((typeof pos === "number" ? pos : 0.5) * 100);
    return ref;
  },
};
