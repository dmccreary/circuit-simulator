import type { ElementView } from "../api";
import { drawBox, pinLabel } from "../logic/symbols";
import { describePart, line } from "../shared/viewKit";

/** CircuitJS1's VCO chip: a box from (1,-1) to (5,7) with its six pins. */
export const vcoView: ElementView = {
  drawSymbol(g) {
    drawBox(g, 1, -1, 5, 7);
    for (const [y, label] of [[0, "Vi"], [6, "Vo"]] as const) {
      line(g, 0, y, 1, y);
      pinLabel(g, label, 1.15, y);
    }
    for (const [y, label] of [[0, "C"], [2, "C"], [4, "R1"], [6, "R2"]] as const) {
      line(g, 5, y, 6, y);
      pinLabel(g, label, 4.85, y, "right");
    }
    g.text("VCO", 3, 3, { size: 0.8, align: "center", baseline: "middle", color: "label" });
  },
  currentPaths: () => [],
  hitShape: () => ({ x: 0, y: -1, w: 6, h: 8 }),
  describe: (part, live) => describePart(part, undefined, live),
};
