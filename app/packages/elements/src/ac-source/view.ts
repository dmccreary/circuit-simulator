import { circle, leads, twoTerminalView } from "../shared/viewKit";

export const acSourceView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 1);
    circle(g, c, 0, 1);
    // One sine period drawn as two half-circle arcs.
    g.beginPath();
    g.arc(c - 0.3, 0, 0.3, Math.PI, 0, false);
    g.arc(c + 0.3, 0, 0.3, Math.PI, 0, true);
    g.stroke("symbol");
    g.text("+", c - 1.3, -0.9, { size: 0.6, align: "center", baseline: "bottom", color: "label" });
  },
  { key: "amplitude", unit: "V", fallback: 5 },
);
