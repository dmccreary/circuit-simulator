import { leads, line, twoTerminalView } from "../shared/viewKit";

export const capacitorView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 0.2);
    line(g, c - 0.2, -0.8, c - 0.2, 0.8);
    line(g, c + 0.2, -0.8, c + 0.2, 0.8);
  },
  { key: "capacitance", unit: "F", fallback: 10e-6 },
);
