import type { ElementView } from "../api";
import { describePart, line } from "../shared/viewKit";
import { drawBox, pinLabel } from "../logic/symbols";

export const currentConveyorView: ElementView = {
  drawSymbol(g, part) {
    drawBox(g, 1, -1, 5, 5);
    line(g, 0, 0, 1, 0);
    line(g, 0, 4, 1, 4);
    line(g, 5, 2, 6, 2);
    pinLabel(g, "X", 1.15, 0);
    pinLabel(g, "Y", 1.15, 4);
    pinLabel(g, "Z", 4.85, 2, "right");
    const gain = typeof part.props.gain === "number" ? part.props.gain : 1;
    g.text(gain < 0 ? "CCII−" : "CCII+", 3, 2, { size: 0.6, align: "center", baseline: "middle", color: "label" });
  },
  currentPaths: () => [],
  hitShape: () => ({ x: 0, y: -1, w: 6, h: 6 }),
  describe: (part, live) => describePart(part, { key: "gain", unit: "", fallback: 1 }, live),
};
