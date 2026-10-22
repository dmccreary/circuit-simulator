import type { Part } from "@cs/model";
import type { SymbolGraphics } from "../api";
import { leads, line, polyline, twoTerminalView } from "../shared/viewKit";

/** Triangle pointing from anode (terminal 0) to the cathode bar. Returns the centre x. */
export function drawDiode(g: SymbolGraphics, part: Part): number {
  const c = leads(g, part, 0.5);
  polyline(g, [
    [c - 0.5, -0.6],
    [c + 0.5, 0],
    [c - 0.5, 0.6],
  ], true);
  g.stroke("symbol");
  line(g, c + 0.5, -0.6, c + 0.5, 0.6);
  line(g, c - 0.5, 0, c + 0.5, 0);
  return c;
}

export const diodeView = twoTerminalView(drawDiode);
