import { circle, leads, line, twoTerminalView } from "../shared/viewKit";

/** Circle with + and − marks; terminal 0 ("+") on the left. */
export const dcSourceView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 1);
    circle(g, c, 0, 1);
    line(g, c - 0.65, 0, c - 0.25, 0);
    line(g, c - 0.45, -0.2, c - 0.45, 0.2);
    line(g, c + 0.25, 0, c + 0.65, 0);
  },
  { key: "voltage", unit: "V", fallback: 5 },
);
