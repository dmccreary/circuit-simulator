import { leads, twoTerminalView } from "../shared/viewKit";

/** Four humps above the axis (canvas y points down, so the arc runs clockwise through -y). */
export const inductorView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 1);
    const r = 0.25;
    g.beginPath();
    g.moveTo(c - 1, 0);
    for (let k = 0; k < 4; k++) g.arc(c - 1 + r + 2 * r * k, 0, r, Math.PI, 0, false);
    g.stroke("symbol");
  },
  { key: "inductance", unit: "H", fallback: 1 },
);
