import type { ElementView } from "../../api";
import { circle, line } from "../../shared/viewKit";
import { describeLogic, readsHigh } from "../symbols";

const CX = 1.6;
const R = 0.9;

export const logicOutputView: ElementView = {
  drawSymbol(g) {
    line(g, 0, 0, CX - R, 0);
    circle(g, CX, 0, R);
  },
  drawLive(g, part, live) {
    const high = readsHigh(part, live.terminalVoltages[0] ?? 0);
    if (high) {
      g.beginPath();
      g.arc(CX, 0, R, 0, 2 * Math.PI);
      g.closePath();
      g.fill("glow", 0.9);
    }
    g.text(high ? "1" : "0", CX, 0, { size: 1, align: "center", baseline: "middle", color: "value" });
  },
  currentPaths: () => [],
  hitShape: () => ({ x: 0, y: -R, w: CX + R, h: 2 * R }),
  describe: (part) => describeLogic(part),
};
