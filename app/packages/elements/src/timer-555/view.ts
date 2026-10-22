import type { ElementView } from "../api";
import { describePart, line } from "../shared/viewKit";
import { drawBox, pinLabel } from "../logic/symbols";

/** Box from (1,-3) to (7,7) with a lead to every pin. */
export const timer555View: ElementView = {
  drawSymbol(g) {
    drawBox(g, 1, -3, 7, 7);
    for (const [y, label] of [[0, "dis"], [4, "tr"], [6, "th"]] as const) {
      line(g, 0, y, 1, y);
      pinLabel(g, label, 1.15, y);
    }
    for (const [y, label] of [[0, "rst"], [2, "out"]] as const) {
      line(g, 7, y, 8, y);
      pinLabel(g, label, 6.85, y, "right");
    }
    line(g, 4, -4, 4, -3);
    pinLabel(g, "Vcc", 4, -2.5, "center");
    line(g, 4, 7, 4, 8);
    pinLabel(g, "ctl", 4, 6.5, "center");
    line(g, 6, 7, 6, 8);
    pinLabel(g, "gnd", 6, 6.5, "center");
    g.text("555", 4, 2, { size: 1, align: "center", baseline: "middle", color: "label" });
  },
  currentPaths: () => [],
  hitShape: () => ({ x: 0, y: -4, w: 8, h: 12 }),
  describe: (part, live) => describePart(part, undefined, live),
};
