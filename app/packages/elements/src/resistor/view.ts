import type { Part } from "@cs/model";
import type { SymbolGraphics } from "../api";
import { leads, polyline, twoTerminalView } from "../shared/viewKit";

/** ANSI zigzag, six peaks across two grid units. */
export function drawZigzag(g: SymbolGraphics, x0: number, x1: number, amp = 0.4): void {
  const n = 6;
  const step = (x1 - x0) / (2 * n);
  const pts: [number, number][] = [[x0, 0]];
  for (let k = 0; k < n; k++) {
    pts.push([x0 + step * (2 * k + 1), k % 2 === 0 ? -amp : amp]);
  }
  pts.push([x1, 0]);
  polyline(g, pts);
  g.stroke("symbol");
}

export function drawResistor(g: SymbolGraphics, part: Part): void {
  const c = leads(g, part, 1);
  drawZigzag(g, c - 1, c + 1);
}

export const resistorView = twoTerminalView(drawResistor, { key: "resistance", unit: "ohm", fallback: 1000 });
