import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { arrowHead } from "../bjt/view";
import { describePart, line, polyline } from "../shared/viewKit";
import { GYRATOR_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => part.length ?? GYRATOR_LENGTH;

/** A box between the two ports marked π with an arrow, as GyratorElm draws it. */
export const gyratorView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const c = L / 2;
    const b0 = Math.max(0.5, c - 1);
    const b1 = Math.min(L - 0.5, c + 1);
    for (const y of [0, 2]) {
      line(g, 0, y, b0, y);
      line(g, b1, y, L, y);
    }
    polyline(g, [[b0, -0.3], [b1, -0.3], [b1, 2.3], [b0, 2.3]], true);
    g.stroke("symbol");
    g.text("π", c, 0.7, { size: 0.8, align: "center", baseline: "middle", color: "label" });
    line(g, c - 0.5, 1.5, c + 0.4, 1.5);
    arrowHead(g, [c - 0.5, 1.5], [c + 0.5, 1.5], 0.25);
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -0.4, w: lengthOf(part), h: 2.8 }),
  describe: (part, live) => describePart(part, { key: "resistance", unit: "ohm", fallback: 1000 }, live),
};
