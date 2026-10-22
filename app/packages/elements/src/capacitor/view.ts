import type { Part } from "@cs/model";
import type { LiveReadouts, SymbolGraphics } from "../api";
import { leads, line, lengthOf, twoTerminalView } from "../shared/viewKit";

/**
 * Charge marks (ANI-18): + and − marks beside the plates, more of them as the
 * charge grows, on the plate that holds that charge. `chargeLevel` is signed:
 * positive when terminal 0's plate is the positive one.
 */
export function drawChargeMarks(g: SymbolGraphics, part: Part, live: LiveReadouts): void {
  const level = live.get("chargeLevel") ?? 0;
  const n = Math.min(5, Math.ceil(Math.min(1, Math.abs(level)) * 5));
  if (n === 0 || Math.abs(level) < 0.02) return;
  const c = lengthOf(part) / 2;
  const plusX = level > 0 ? c - 0.55 : c + 0.55;
  const minusX = level > 0 ? c + 0.55 : c - 0.55;
  const h = 0.12;
  const y = (k: number) => (n === 1 ? 0 : -0.6 + (1.2 * k) / (n - 1));
  // One stroke per plate: the live layer redraws every frame.
  g.beginPath();
  for (let k = 0; k < n; k++) {
    g.moveTo(plusX - h, y(k));
    g.lineTo(plusX + h, y(k));
    g.moveTo(plusX, y(k) - h);
    g.lineTo(plusX, y(k) + h);
  }
  g.stroke("charge.plus", 0.07);
  g.beginPath();
  for (let k = 0; k < n; k++) {
    g.moveTo(minusX - h, y(k));
    g.lineTo(minusX + h, y(k));
  }
  g.stroke("charge.minus", 0.07);
}

export const capacitorView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 0.2);
    line(g, c - 0.2, -0.8, c - 0.2, 0.8);
    line(g, c + 0.2, -0.8, c + 0.2, 0.8);
  },
  { key: "capacitance", unit: "F", fallback: 10e-6 },
  { drawLive: drawChargeMarks },
);
