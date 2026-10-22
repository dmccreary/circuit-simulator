import type { ElementView } from "../api";
import { describeLogic } from "../logic/symbols";
import { num } from "../shared/props";
import { line } from "../shared/viewKit";
import { BUS_INPUT_WIDTHS, busInputType } from "./descriptor";

/** A thick lead over the bit terminals, then the value. */
function view(width: number): ElementView {
  return {
    drawSymbol(g, part) {
      line(g, 0, 0, width - 1, 0);
      g.beginPath();
      g.moveTo(0, 0.08);
      g.lineTo(width - 1, 0.08);
      g.stroke("symbol", 2);
      g.text(String(Math.round(num(part.props, "value", 0))), width + 0.5, 0, { size: 1, align: "center", baseline: "middle", color: "value" });
    },
    currentPaths: () => [],
    hitShape: () => ({ x: 0, y: -1, w: width + 2, h: 2 }),
    describe: (part) => describeLogic(part),
  };
}

export const BUS_INPUT_VIEWS: Record<string, ElementView> = Object.fromEntries(BUS_INPUT_WIDTHS.map((w) => [busInputType(w), view(w)]));
