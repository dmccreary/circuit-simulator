import { circle, leads, polyline, twoTerminalView } from "../shared/viewKit";

export const squareSourceView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 1);
    circle(g, c, 0, 1);
    polyline(g, [
      [c - 0.6, 0.3],
      [c - 0.3, 0.3],
      [c - 0.3, -0.3],
      [c + 0.3, -0.3],
      [c + 0.3, 0.3],
      [c + 0.6, 0.3],
    ]);
    g.stroke("symbol");
    g.text("+", c - 1.3, -0.9, { size: 0.6, align: "center", baseline: "bottom", color: "label" });
  },
  { key: "frequency", unit: "Hz", fallback: 1000 },
);
