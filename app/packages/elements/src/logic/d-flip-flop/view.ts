import type { ElementView } from "../../api";
import { stretchOf } from "../../shared/stretch";
import { line } from "../../shared/viewKit";
import { clockWedge, describeLogic, drawBox, pinLabel } from "../symbols";

export const dFlipFlopView: ElementView = {
  drawSymbol(g, part) {
    const e = stretchOf(part, 4);
    drawBox(g, 1, -1, 3, 3);
    line(g, 0, 0, 1, 0);
    line(g, 0, 2, 1, 2);
    line(g, 3, 0, 4 + e, 0);
    line(g, 3, 2, 4 + e, 2);
    line(g, 2, -2, 2, -1);
    line(g, 2, 3, 2, 4);
    clockWedge(g, 1, 2);
    pinLabel(g, "D", 1.15, 0);
    pinLabel(g, "Q", 2.85, 0, "right");
    pinLabel(g, "Q̄", 2.85, 2, "right");
    pinLabel(g, "S", 2, -0.6, "center");
    pinLabel(g, "R", 2, 2.6, "center");
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -2, w: Math.max(3, 4 + stretchOf(part, 4)), h: 6 }),
  describe: (part) => describeLogic(part),
};
