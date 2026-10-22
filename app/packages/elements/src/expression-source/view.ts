import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { num, str } from "../shared/props";
import { describePart, line } from "../shared/viewKit";
import { drawBox, pinLabel } from "../logic/symbols";
import { EXPR_MAX_INPUTS } from "./descriptor";

const used = (part: Part) => Math.max(0, Math.min(EXPR_MAX_INPUTS, Math.round(num(part.props, "inputs", 2))));
const height = (part: Part) => Math.max(2, used(part)) * 2;

/** A box as tall as the used inputs, with the formula across it. */
export const expressionSourceView: ElementView = {
  drawSymbol(g, part) {
    const n = used(part);
    const h = height(part);
    drawBox(g, 1, -1, 5, h - 1);
    const cc = str(part.props, "kind", "vcvs").startsWith("cc");
    for (let i = 0; i < n; i++) {
      line(g, 0, 2 * i, 1, 2 * i);
      const name = String.fromCharCode(97 + (cc ? Math.floor(i / 2) : i));
      pinLabel(g, cc ? `${name}${i % 2 ? "−" : "+"}` : name, 1.15, 2 * i);
    }
    line(g, 5, 0, 6, 0);
    line(g, 5, 2, 6, 2);
    pinLabel(g, "+", 4.85, 0, "right");
    pinLabel(g, "−", 4.85, 2, "right");
    const kind = str(part.props, "kind", "vcvs").toUpperCase();
    g.text(kind, 3, h / 2 - 1.4, { size: 0.5, align: "center", baseline: "middle", color: "label" });
    const expr = str(part.props, "expression", "");
    g.text(expr.length > 14 ? `${expr.slice(0, 13)}…` : expr, 3, h / 2 - 0.6, { size: 0.45, align: "center", baseline: "middle", color: "value" });
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -1, w: 6, h: height(part) }),
  describe: (part, live) => describePart(part, undefined, live),
};
