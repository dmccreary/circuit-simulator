import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { describePart, line, polyline } from "../shared/viewKit";
import { OPAMP_LENGTH } from "./descriptor";

/** Input-to-output distance; parts imported at other Falstad sizes stretch (CircuitJS1 OpAmpElm). */
const lengthOf = (part: Part) => part.length ?? OPAMP_LENGTH;

/** Triangle with "−" (terminal 0) on top and "+" below; the output at the apex. Body (up to 4 units) centred. */
export const opAmpView: ElementView = {
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
    g.text("−", T0 + 0.45, 0, { align: "center", baseline: "middle" });
    g.text("+", T0 + 0.45, 2, { align: "center", baseline: "middle" });
  },
  // Output current returns through the supply rails (ground), not another terminal.
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -0.8, w: lengthOf(part), h: 3.6 }),
  describe: (part, live) => describePart(part, { key: "gain", unit: "", fallback: 100000 }, live),
};
