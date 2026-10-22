import type { ElementView } from "../../api";
import { line } from "../../shared/viewKit";
import { clockWedge, describeLogic, drawBox, pinLabel } from "../symbols";

export const jkFlipFlopView: ElementView = {
  drawSymbol(g) {
    drawBox(g, 1, -1, 3, 5);
    for (const y of [0, 2, 4]) line(g, 0, y, 1, y);
    line(g, 3, 0, 4, 0);
    line(g, 3, 4, 4, 4);
    clockWedge(g, 1, 2);
    pinLabel(g, "J", 1.15, 0);
    pinLabel(g, "K", 1.15, 4);
    pinLabel(g, "Q", 2.85, 0, "right");
    pinLabel(g, "Q̄", 2.85, 4, "right");
  },
  currentPaths: () => [],
  hitShape: () => ({ x: 0, y: -1, w: 4, h: 6 }),
  describe: (part) => describeLogic(part),
};
