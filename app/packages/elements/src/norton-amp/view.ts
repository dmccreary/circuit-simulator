import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { circle, describePart, line, polyline } from "../shared/viewKit";
import { NORTON_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => part.length ?? NORTON_LENGTH;

/** An op-amp triangle ("+" on top) with NortonAmpElm's current-source circle at the inputs. */
export const nortonAmpView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const body = Math.min(4, L);
    const T0 = (L - body) / 2;
    const T1 = T0 + body;
    line(g, 0, 0, T0, 0);
    line(g, 0, 2, T0, 2);
    line(g, T1, 1, L, 1);
    polyline(g, [[T0, -0.7], [T0, 2.7], [T1, 1]], true);
    g.stroke("symbol");
    g.text("+", T0 + 0.45, 0, { align: "center", baseline: "middle" });
    g.text("−", T0 + 0.45, 2, { align: "center", baseline: "middle" });
    circle(g, T0, 1, 0.45);
    polyline(g, [[T0 + 0.3, 1], [T0 - 0.15, 0.75], [T0 - 0.15, 1.25]], true);
    g.fill("symbol");
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -0.8, w: lengthOf(part), h: 3.6 }),
  describe: (part, live) => describePart(part, undefined, live),
};
