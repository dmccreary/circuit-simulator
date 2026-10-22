import type { Point } from "@cs/model";
import type { ElementView } from "../api";
import { arrowHead } from "../bjt/view";
import { shiftX, stretchOf } from "../shared/stretch";
import { describePart, line, polyline } from "../shared/viewKit";
import { UJT_LENGTH } from "./descriptor";

/** Base bar between B2 (axis) and B1 (two below), with the emitter arrow slanting into it. */
export const unijunctionView: ElementView = {
  drawSymbol(g0, part) {
    const e = stretchOf(part, UJT_LENGTH);
    const L = UJT_LENGTH;
    line(g0, 0, 0, L - 2 + e, 0);
    const g = shiftX(g0, e);
    polyline(g, [[L - 2, 0], [L - 1, 0.7]]);
    g.stroke("symbol");
    arrowHead(g, [L - 2, 0], [L - 0.95, 0.73]);
    polyline(g, [[L - 0.8, -0.3], [L - 0.8, 2.3], [L - 0.6, 2.3], [L - 0.6, -0.3]], true);
    g.stroke("symbol");
    line(g, L - 0.6, 0, L, 0);
    line(g, L - 0.6, 2, L, 2);
  },
  currentPaths: (part) => {
    const e = stretchOf(part, UJT_LENGTH);
    const L = UJT_LENGTH + e;
    const pts = (...p: [number, number][]): Point[] => p.map(([x, y]) => ({ x, y }));
    return [
      { points: pts([L, 0], [L - 0.7, 0], [L - 0.7, 2], [L, 2]), from: 2, to: 1 },
      { points: pts([0, 0], [L - 2, 0], [L - 0.7, 0.9], [L - 0.7, 2], [L, 2]), from: 0, to: 1 },
    ];
  },
  hitShape: (part) => ({ x: 0, y: -0.5, w: UJT_LENGTH + stretchOf(part, UJT_LENGTH), h: 3 }),
  describe: (part, live) => describePart(part, undefined, live),
};
