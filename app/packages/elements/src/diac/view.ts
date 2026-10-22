import type { SymbolGraphics } from "../api";
import { leads, line, polyline, twoTerminalView } from "../shared/viewKit";

/** Two plates with opposed triangles between them (DiacElm), centred at c. */
export function drawDiacBody(g: SymbolGraphics, c: number): void {
  line(g, c - 0.5, -1, c - 0.5, 1);
  line(g, c + 0.5, -1, c + 0.5, 1);
  polyline(g, [[c - 0.5, -1], [c + 0.5, -0.5], [c - 0.5, 0]], true);
  g.stroke("symbol");
  polyline(g, [[c + 0.5, 1], [c - 0.5, 0.5], [c + 0.5, 0]], true);
  g.stroke("symbol");
}

export const diacView = twoTerminalView(
  (g, part) => drawDiacBody(g, leads(g, part, 0.5)),
  { key: "breakdownVoltage", unit: "V", fallback: 30 },
);
