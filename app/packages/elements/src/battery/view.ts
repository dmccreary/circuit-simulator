import type { Part } from "@cs/model";
import type { SymbolGraphics } from "../api";
import { leads, line, twoTerminalView } from "../shared/viewKit";

/** Long plate is "+" (terminal 0, left), short plate is "-". */
export function drawCell(g: SymbolGraphics, part: Part): void {
  const c = leads(g, part, 0.15);
  line(g, c - 0.15, -0.9, c - 0.15, 0.9);
  g.beginPath();
  g.moveTo(c + 0.15, -0.45);
  g.lineTo(c + 0.15, 0.45);
  g.stroke("symbol", 0.2);
  g.text("+", c - 0.6, -0.9, { size: 0.6, align: "center", baseline: "bottom", color: "label" });
}

export const batteryView = twoTerminalView(drawCell, { key: "voltage", unit: "V", fallback: 9 });
