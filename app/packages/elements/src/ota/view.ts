import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { arrowHead } from "../bjt/view";
import { circle, describePart, line, polyline } from "../shared/viewKit";
import { OTA_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => part.length ?? OTA_LENGTH;

/** Triangle with "+" on top and "−" below, a current-source double circle at the output (OTAElm). */
export const otaView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const t0 = L - 6;
    line(g, 0, 0, t0 + 0.5, 0);
    line(g, 0, 4, t0 + 0.5, 4);
    line(g, 0, 2, t0 + 0.5, 2);
    polyline(g, [[t0 + 0.5, -0.5], [t0 + 0.5, 4.5], [t0 + 4, 2]], true);
    g.stroke("symbol");
    g.text("+", t0 + 1, 0, { align: "center", baseline: "middle" });
    g.text("−", t0 + 1, 4, { align: "center", baseline: "middle" });
    circle(g, L - 1.6, 2, 0.6);
    circle(g, L - 0.9, 2, 0.6);
    line(g, L - 0.3, 2, L, 2);
    line(g, L - 1, 0, L - 1, 1.2);
    arrowHead(g, [L - 1, 0.3], [L - 1, 1.2], 0.25);
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -0.6, w: lengthOf(part), h: 5.2 }),
  describe: (part, live) => describePart(part, undefined, live),
};
