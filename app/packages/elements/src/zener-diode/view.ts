import { leads, line, polyline, twoTerminalView } from "../shared/viewKit";

/** Diode triangle with the zener's bent ("Z") cathode bar. */
export const zenerDiodeView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 0.5);
    polyline(g, [
      [c - 0.5, -0.6],
      [c + 0.5, 0],
      [c - 0.5, 0.6],
    ], true);
    g.stroke("symbol");
    line(g, c - 0.5, 0, c + 0.5, 0);
    polyline(g, [
      [c + 0.25, -0.75],
      [c + 0.5, -0.6],
      [c + 0.5, 0.6],
      [c + 0.75, 0.75],
    ]);
    g.stroke("symbol");
  },
  { key: "zenerVoltage", unit: "V", fallback: 5.6 },
);
