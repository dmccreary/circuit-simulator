import { drawChargeMarks } from "../capacitor/view";
import { leads, line, polyline, twoTerminalView } from "../shared/viewKit";

/** Straight "+" plate, curved "-" plate, and a small plus sign on the "+" side. */
export const polarCapacitorView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 0.2);
    line(g, c - 0.2, -0.8, c - 0.2, 0.8);
    const pts: [number, number][] = [];
    for (let k = 0; k <= 8; k++) {
      const y = -0.8 + (1.6 * k) / 8;
      pts.push([c + 0.2 + 0.25 * (1 - Math.sqrt(1 - (y / 0.9) ** 2)), y]);
    }
    polyline(g, pts);
    g.stroke("symbol");
    line(g, c - 0.75, -0.75, c - 0.45, -0.75);
    line(g, c - 0.6, -0.9, c - 0.6, -0.6);
  },
  { key: "capacitance", unit: "F", fallback: 10e-6 },
  { drawLive: drawChargeMarks },
);
