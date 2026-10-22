import type { Part } from "@cs/model";
import { formatValue } from "@cs/units";
import type { ElementView } from "../api";
import { bool } from "../shared/props";
import { describePart, line } from "../shared/viewKit";
import { READOUT_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => Math.max(0.5, part.length ?? READOUT_LENGTH);

/** A lead ending in a small dot; the live voltage is written past the dot. */
export const voltageReadoutView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    line(g, 0, 0, L - 0.25, 0);
    g.beginPath();
    g.arc(L, 0, 0.25, 0, 2 * Math.PI);
    g.closePath();
    g.stroke("symbol");
  },
  drawLive(g, part, live) {
    if (!bool(part.props, "showValue", true)) return;
    const v = live.terminalVoltages[0] ?? live.get("voltage") ?? 0;
    g.text(formatValue(v, "V"), lengthOf(part) + 0.5, 0, { size: 0.6, align: "left", baseline: "middle", color: "value" });
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -0.5, w: lengthOf(part) + 0.5, h: 1 }),
  describe: (part, live) => describePart(part, undefined, live),
};
