import type { ElementView } from "../api";
import { drawBox, pinLabel } from "../logic/symbols";
import { describePart, line } from "../shared/viewKit";

/** CircuitJS1's phase comparator chip: a box from (1,-1) to (5,3). */
export const phaseComparatorView: ElementView = {
  drawSymbol(g) {
    drawBox(g, 1, -1, 5, 3);
    for (const [y, label] of [[0, "I1"], [2, "I2"]] as const) {
      line(g, 0, y, 1, y);
      pinLabel(g, label, 1.15, y);
    }
    line(g, 5, 0, 6, 0);
    pinLabel(g, "O", 4.85, 0, "right");
    g.text("φ", 3, 1.3, { size: 0.9, align: "center", baseline: "middle", color: "label" });
  },
  currentPaths: () => [],
  hitShape: () => ({ x: 0, y: -1, w: 6, h: 4 }),
  describe: (part, live) => describePart(part, undefined, live),
};
