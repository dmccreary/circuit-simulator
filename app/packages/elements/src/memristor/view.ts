import type { SymbolGraphics } from "../api";
import { leads, line, polyline, twoTerminalView } from "../shared/viewKit";

/** A box with a square-wave track and a thick band at the "+" end. */
export const memristorView = twoTerminalView((g: SymbolGraphics, part) => {
  const c = leads(g, part, 1.2);
  polyline(g, [[c - 1.2, -0.5], [c + 1.2, -0.5], [c + 1.2, 0.5], [c - 1.2, 0.5]], true);
  g.stroke("symbol");
  polyline(g, [[c - 1.2, 0], [c - 0.8, 0], [c - 0.8, -0.3], [c - 0.2, -0.3], [c - 0.2, 0.3], [c + 0.4, 0.3], [c + 0.4, 0], [c + 1.2, 0]]);
  g.stroke("symbol");
  line(g, c + 0.9, -0.5, c + 0.9, 0.5);
}, { key: "onResistance", unit: "ohm", fallback: 100 });
