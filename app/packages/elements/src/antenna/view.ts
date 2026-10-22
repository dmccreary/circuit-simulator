import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { describePart, line } from "../shared/viewKit";
import { ANTENNA_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => Math.max(0.5, part.length ?? ANTENNA_LENGTH);

/** Lead from the terminal to a mast with a "V" of radiating elements at its end. */
export const antennaView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    line(g, 0, 0, L + 0.6, 0);
    line(g, L, 0, L + 0.8, -0.6);
    line(g, L, 0, L + 0.8, 0.6);
    line(g, L + 0.8, -0.6, L + 0.8, 0.6);
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -0.7, w: lengthOf(part) + 0.9, h: 1.4 }),
  describe: (part, live) => describePart(part, { key: "frequency", unit: "Hz", fallback: 3000 }, live),
};
