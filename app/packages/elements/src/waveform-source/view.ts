import type { Part } from "@cs/model";
import type { SymbolGraphics } from "../api";
import { str } from "../shared/props";
import { circle, leads, polyline, twoTerminalView } from "../shared/viewKit";

/** Circle with a sketch of the waveform; "+" (terminal 0) on the left. */
function drawWave(g: SymbolGraphics, part: Part): void {
  const c = leads(g, part, 1);
  circle(g, c, 0, 1);
  const w = str(part.props, "waveform", "triangle");
  const pts: Record<string, [number, number][]> = {
    triangle: [[-0.6, 0.3], [-0.3, -0.3], [0.3, 0.3], [0.6, -0.3]],
    sawtooth: [[-0.6, 0.3], [0, -0.3], [0, 0.3], [0.6, -0.3]],
    pulse: [[-0.6, 0.3], [-0.3, 0.3], [-0.3, -0.3], [0.1, -0.3], [0.1, 0.3], [0.6, 0.3]],
    square: [[-0.6, 0.3], [-0.6, -0.3], [0, -0.3], [0, 0.3], [0.6, 0.3], [0.6, -0.3]],
    noise: [[-0.6, 0], [-0.4, -0.3], [-0.25, 0.2], [-0.05, -0.1], [0.15, 0.3], [0.35, -0.25], [0.6, 0.1]],
  };
  polyline(g, (pts[w] ?? pts.triangle).map(([x, y]) => [c + x, y]));
  g.stroke("symbol");
  g.text("+", c - 1.3, -0.9, { size: 0.6, align: "center", baseline: "bottom", color: "label" });
}

export const waveformSourceView = twoTerminalView(drawWave, { key: "voltage", unit: "V", fallback: 5 });
