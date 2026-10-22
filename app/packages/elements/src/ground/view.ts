import type { ElementView } from "../api";
import { describePart, line } from "../shared/viewKit";

export const groundView: ElementView = {
  drawSymbol(g) {
    line(g, 0, 0, 0, 1);
    line(g, -0.75, 1, 0.75, 1);
    line(g, -0.45, 1.3, 0.45, 1.3);
    line(g, -0.15, 1.6, 0.15, 1.6);
  },
  currentPaths: () => [],
  hitShape: () => ({ x: -0.8, y: -0.2, w: 1.6, h: 2 }),
  describe: (part) => describePart(part),
};
