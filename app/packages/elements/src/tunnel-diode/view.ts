import { leads, line, polyline, twoTerminalView } from "../shared/viewKit";

/** Diode triangle whose cathode bar has short hooks pointing back toward the anode. */
export const tunnelDiodeView = twoTerminalView((g, part) => {
  const c = leads(g, part, 0.5);
  polyline(g, [
    [c - 0.5, -0.6],
    [c + 0.5, 0],
    [c - 0.5, 0.6],
  ], true);
  g.stroke("symbol");
  line(g, c - 0.5, 0, c + 0.5, 0);
  polyline(g, [
    [c + 0.2, -0.6],
    [c + 0.5, -0.6],
    [c + 0.5, 0.6],
    [c + 0.2, 0.6],
  ]);
  g.stroke("symbol");
});
