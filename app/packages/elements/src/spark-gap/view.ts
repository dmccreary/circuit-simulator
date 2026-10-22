import { arrowHead } from "../bjt/view";
import { leads, line, twoTerminalView } from "../shared/viewKit";

/** Two leads ending in arrowheads that point at each other across the gap. */
export const sparkGapView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 0.9);
    line(g, c - 0.9, 0, c - 0.2, 0);
    line(g, c + 0.2, 0, c + 0.9, 0);
    arrowHead(g, [c - 0.9, 0], [c - 0.15, 0], 0.45);
    arrowHead(g, [c + 0.9, 0], [c + 0.15, 0], 0.45);
  },
  { key: "breakdownVoltage", unit: "V", fallback: 1000 },
);
