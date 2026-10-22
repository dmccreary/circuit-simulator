import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { num, str } from "../shared/props";
import { describePart, line } from "../shared/viewKit";
import { drawBox } from "../logic/symbols";
import { DISPLAY_MAX_BITS } from "./descriptor";

const bitsOf = (part: Part) => Math.max(1, Math.min(DISPLAY_MAX_BITS, Math.round(num(part.props, "bits", 4))));
const height = (part: Part) => Math.max(2, bitsOf(part)) * 2;

/** The value of the inputs (terminal 0 is the most significant bit). */
export function displayedValue(part: Part, volts: readonly number[]): string {
  const n = bitsOf(part);
  const th = num(part.props, "threshold", 2.5);
  let v = 0;
  for (let k = 0; k < n; k++) if ((volts[k] ?? 0) > th) v += 2 ** (n - 1 - k);
  const mode = str(part.props, "mode", "decimal");
  return mode === "hex" ? v.toString(16).toUpperCase() : mode === "octal" ? v.toString(8) : String(v);
}

export const numberDisplayView: ElementView = {
  drawSymbol(g, part) {
    const n = bitsOf(part);
    drawBox(g, 1, -1, 7, height(part) - 1);
    for (let k = 0; k < n; k++) line(g, 0, 2 * k, 1, 2 * k);
  },
  drawLive(g, part, live) {
    g.text(displayedValue(part, live.terminalVoltages), 4, height(part) / 2 - 1, {
      size: 1.6,
      align: "center",
      baseline: "middle",
      color: "value",
    });
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -1, w: 7, h: height(part) }),
  describe: (part, live) => describePart(part, undefined, live),
};
