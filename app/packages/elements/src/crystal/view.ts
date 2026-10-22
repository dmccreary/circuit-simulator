import { leads, line, polyline, twoTerminalView } from "../shared/viewKit";

/** Two plates with the quartz slab between them. */
export const crystalView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 0.6);
    line(g, c - 0.6, -0.75, c - 0.6, 0.75);
    line(g, c + 0.6, -0.75, c + 0.6, 0.75);
    polyline(g, [[c - 0.3, -0.6], [c + 0.3, -0.6], [c + 0.3, 0.6], [c - 0.3, 0.6]], true);
    g.stroke("symbol");
  },
  { key: "frequency", unit: "Hz", fallback: 10e6 },
);
