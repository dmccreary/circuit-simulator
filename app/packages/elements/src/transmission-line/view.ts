import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { stretchOf } from "../shared/stretch";
import { describePart, line, polyline } from "../shared/viewKit";
import { TLINE_LENGTH, TLINE_WIDTH } from "./descriptor";

const lengthOf = (part: Part) => TLINE_LENGTH + stretchOf(part, TLINE_LENGTH);

/** Leads from the four terminals into a long shaded body between the conductors. */
export const transmissionLineView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const W = TLINE_WIDTH;
    const top = W / 2 - 0.5;
    const bottom = W / 2 + 0.5;
    line(g, 0, 0, 0, top);
    line(g, L, 0, L, top);
    line(g, 0, W, 0, bottom);
    line(g, L, W, L, bottom);
    polyline(g, [[0, top], [L, top], [L, bottom], [0, bottom]], true);
    g.fill("symbol", 0.25);
    polyline(g, [[0, top], [L, top], [L, bottom], [0, bottom]], true);
    g.stroke("symbol");
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: 0, w: lengthOf(part), h: TLINE_WIDTH }),
  describe: (part, live) => describePart(part, { key: "impedance", unit: "ohm", fallback: 75 }, live),
};
