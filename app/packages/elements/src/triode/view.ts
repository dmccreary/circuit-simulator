import type { Point } from "@cs/model";
import type { ElementView } from "../api";
import { shiftX, stretchOf } from "../shared/stretch";
import { circle, describePart, line, polyline } from "../shared/viewKit";
import { TRIODE_LENGTH } from "./descriptor";

/**
 * Envelope circle around the plate column (x = L); plate bar above the axis,
 * a dashed grid on the axis, and the cathode below, as TriodeElm draws them.
 */
export const triodeView: ElementView = {
  drawSymbol(g0, part) {
    const e = stretchOf(part, TRIODE_LENGTH);
    const L = TRIODE_LENGTH;
    line(g0, 0, 0, L - 1.5 + e, 0);
    const g = shiftX(g0, e);
    circle(g, L, 0, 1.5);
    // Plate: lead from the terminal down to a bar.
    line(g, L, -2, L, -0.5);
    line(g, L - 0.6, -0.5, L + 0.6, -0.5);
    // Grid: dashes across the axis.
    for (let x = L - 1.5; x < L + 0.9; x += 0.5) line(g, x, 0, x + 0.25, 0);
    // Cathode: bar below the grid, bent down to the terminal.
    polyline(g, [[L + 0.6, 0.5], [L - 0.6, 0.5], [L - 1, 1], [L - 1, 2]]);
    g.stroke("symbol");
  },
  currentPaths: (part) => {
    const e = stretchOf(part, TRIODE_LENGTH);
    const L = TRIODE_LENGTH + e;
    const pts = (...p: [number, number][]): Point[] => p.map(([x, y]) => ({ x, y }));
    return [{ points: pts([L, -2], [L, 0.5], [L - 0.6, 0.5], [L - 1, 1], [L - 1, 2]), from: 1, to: 2 }];
  },
  hitShape: (part) => ({ x: 0, y: -2, w: TRIODE_LENGTH + stretchOf(part, TRIODE_LENGTH) + 1.5, h: 4 }),
  describe: (part, live) => describePart(part, { key: "mu", unit: "", fallback: 93 }, live),
};
