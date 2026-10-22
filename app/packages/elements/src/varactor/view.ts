import { leads, line, polyline, twoTerminalView } from "../shared/viewKit";

/** Diode triangle followed by a pair of capacitor plates. */
export const varactorView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 0.6);
    polyline(g, [
      [c - 0.6, -0.6],
      [c + 0.3, 0],
      [c - 0.6, 0.6],
    ], true);
    g.stroke("symbol");
    line(g, c - 0.6, 0, c + 0.3, 0);
    line(g, c + 0.3, -0.6, c + 0.3, 0.6);
    line(g, c + 0.6, -0.6, c + 0.6, 0.6);
  },
  { key: "baseCapacitance", unit: "F", fallback: 4e-12 },
);
