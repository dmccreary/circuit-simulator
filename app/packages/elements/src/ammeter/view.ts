import type { Part } from "@cs/model";
import type { SymbolGraphics } from "../api";
import { circle, leads, twoTerminalView } from "../shared/viewKit";

export function drawMeter(letter: string) {
  return (g: SymbolGraphics, part: Part): void => {
    const c = leads(g, part, 1);
    circle(g, c, 0, 1);
    g.text(letter, c, 0, { size: 1, align: "center", baseline: "middle", color: "symbol" });
    g.text("+", c - 1.3, -0.9, { size: 0.6, align: "center", baseline: "bottom", color: "label" });
  };
}

export const ammeterView = twoTerminalView(drawMeter("A"));
