import { circle, leads, line, polyline, twoTerminalView } from "../shared/viewKit";

/** Arrow points from terminal 0 to terminal 1, the direction current is pushed. */
export const currentSourceView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 1);
    circle(g, c, 0, 1);
    line(g, c - 0.6, 0, c + 0.4, 0);
    polyline(g, [
      [c + 0.6, 0],
      [c + 0.2, -0.3],
      [c + 0.2, 0.3],
    ], true);
    g.fill("symbol");
  },
  { key: "current", unit: "A", fallback: 0.01 },
);
