import type { ElementView } from "../../api";
import { line, polyline } from "../../shared/viewKit";
import { describeLogic, drawBox } from "../symbols";

export const clockView: ElementView = {
  drawSymbol(g) {
    drawBox(g, -3, -0.8, -1, 0.8);
    line(g, -1, 0, 0, 0);
    polyline(g, [
      [-2.7, 0.4],
      [-2.3, 0.4],
      [-2.3, -0.4],
      [-1.8, -0.4],
      [-1.8, 0.4],
      [-1.3, 0.4],
    ]);
    g.stroke("symbol");
  },
  currentPaths: () => [],
  hitShape: () => ({ x: -3, y: -0.8, w: 3, h: 1.6 }),
  describe: (part) => describeLogic(part),
};
