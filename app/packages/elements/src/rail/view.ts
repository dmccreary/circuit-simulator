import type { Part } from "@cs/model";
import { formatValue } from "@cs/units";
import type { ElementView } from "../api";
import { num, str } from "../shared/props";
import { describePart, line } from "../shared/viewKit";
import { RAIL_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => Math.max(0.5, part.length ?? RAIL_LENGTH);

function railText(part: Part): string {
  const w = str(part.props, "waveform", "dc");
  const v = num(part.props, "voltage", 5);
  if (w === "dc") return formatValue(v + num(part.props, "offset", 0), "V");
  if (w === "sweep") return "Sweep";
  return `${w === "ac" ? "~" : w === "square" || w === "pulse" ? "⊓" : "∧"} ${formatValue(v, "V")}`;
}

/** Lead from the terminal, then the value where CircuitJS1 draws its rail circle. */
export const railView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    line(g, 0, 0, L - 0.5, 0);
    g.beginPath();
    g.arc(L, 0, 0.5, 0, 2 * Math.PI);
    g.closePath();
    g.stroke("symbol");
    g.text(railText(part), L + 0.7, 0, { size: 0.6, align: "left", baseline: "middle", color: "value" });
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -0.6, w: lengthOf(part) + 0.6, h: 1.2 }),
  describe: (part, live) => describePart(part, { key: "voltage", unit: "V", fallback: 5 }, live),
};
