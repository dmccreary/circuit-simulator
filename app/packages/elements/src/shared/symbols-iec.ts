// IEC 60617 symbols (CAN-07, CAN-14 `iec`) for parts whose IEC form differs
// from the ANSI one. Parts drawn alike in both standards (capacitor, battery,
// diode, LED, switch, lamp, ground, meters, transistors) keep their ANSI view.
// Logic gates draw their IEC rectangles in logic/gates/view.ts.

import type { Part } from "@cs/model";
import type { SymbolGraphics } from "../api";
import { POT_WIPER } from "../potentiometer/descriptor";
import { OPAMP_LENGTH } from "../op-amp/descriptor";
import { stretchOf } from "./stretch";
import { circle, leads, line, polyline } from "./viewKit";
import { rectPath } from "./graphics-ext";

export type SymbolDrawer = (g: SymbolGraphics, part: Part) => void;

/** Rectangle body between the leads (resistor, fuse). */
function box(g: SymbolGraphics, part: Part, halfH = 0.4): number {
  const c = leads(g, part, 1);
  rectPath(g, c - 1, -halfH, 2, 2 * halfH);
  g.stroke("symbol");
  return c;
}

const resistor: SymbolDrawer = (g, part) => void box(g, part);

/** IEC inductor: a filled bar. */
const inductor: SymbolDrawer = (g, part) => {
  const c = leads(g, part, 1);
  rectPath(g, c - 1, -0.3, 2, 0.6);
  g.fill("symbol");
  g.stroke("symbol");
};

/** Ideal voltage source: a circle with the conductor drawn through it. */
const voltageSource: SymbolDrawer = (g, part) => {
  const c = leads(g, part, 1);
  circle(g, c, 0, 1);
  line(g, c - 1, 0, c + 1, 0);
  g.text("+", c - 1.3, -0.8, { size: 0.6, align: "center", baseline: "bottom", color: "label" });
};

/** Ideal current source: a circle with a bar across the conductor, arrow beside it. */
const currentSource: SymbolDrawer = (g, part) => {
  const c = leads(g, part, 1);
  circle(g, c, 0, 1);
  line(g, c, -1, c, 1);
  line(g, c - 0.6, -1.4, c + 0.4, -1.4);
  polyline(g, [
    [c + 0.6, -1.4],
    [c + 0.3, -1.6],
    [c + 0.3, -1.2],
  ], true);
  g.fill("symbol");
};

const fuse: SymbolDrawer = (g, part) => {
  const c = box(g, part, 0.3);
  line(g, c - 1, 0, c + 1, 0);
};

/** Potentiometer: the resistor rectangle with the wiper arrow, same geometry as the ANSI view. */
const potentiometer: SymbolDrawer = (g, part) => {
  const e = stretchOf(part, 4);
  const L = 4 + e;
  const wx = POT_WIPER.x + Math.floor(e / 2);
  line(g, 0, 0, wx - 1, 0);
  rectPath(g, wx - 1, -0.4, 2, 0.8);
  g.stroke("symbol");
  line(g, wx + 1, 0, L, 0);
  line(g, wx, POT_WIPER.y, wx, -0.85);
  polyline(g, [
    [wx, -0.45],
    [wx - 0.25, -0.9],
    [wx + 0.25, -0.9],
  ], true);
  g.fill("symbol");
};

/** Op-amp: rectangle with the amplifier triangle and ∞ (IEC 60617-13). */
const opAmp: SymbolDrawer = (g, part) => {
  const L = part.length ?? OPAMP_LENGTH;
  const body = Math.min(4, L);
  const T0 = (L - body) / 2;
  const T1 = T0 + body;
  line(g, 0, 0, T0, 0);
  line(g, 0, 2, T0, 2);
  line(g, T1, 1, L, 1);
  rectPath(g, T0, -0.7, body, 3.4);
  g.stroke("symbol");
  g.text("▷ ∞", T0 + body / 2, -0.2, { size: 0.6, align: "center", baseline: "middle" });
  g.text("−", T0 + 0.45, 0, { align: "center", baseline: "middle" });
  g.text("+", T0 + 0.45, 2, { align: "center", baseline: "middle" });
};

export const IEC_SYMBOLS: Record<string, SymbolDrawer> = {
  resistor,
  inductor,
  "dc-source": voltageSource,
  "current-source": currentSource,
  potentiometer,
  fuse,
  "op-amp": opAmp,
};

/** Logic gate IEC labels (IEC 60617-12): & for AND, ≥1 for OR, =1 for XOR, 1 for a buffer/NOT. */
export function iecGateLabel(shape: "and" | "or" | "xor" | "not"): string {
  return shape === "and" ? "&" : shape === "or" ? "≥1" : shape === "xor" ? "=1" : "1";
}

/** IEC two-input gate body in drawGate's frame: inputs at y = 0 and 2, output at (4, 1). */
export function drawGateIec(g: SymbolGraphics, shape: "and" | "or" | "xor", inverted: boolean): void {
  rectPath(g, 1, -0.5, 2.5, 3);
  g.stroke("symbol");
  g.text(iecGateLabel(shape), 2.25, 1, { size: 0.7, align: "center", baseline: "middle" });
  let tip = 3.5;
  if (inverted) {
    circle(g, tip + 0.2, 1, 0.2);
    tip += 0.4;
  }
  line(g, tip, 1, 4, 1);
  line(g, 0, 0, 1, 0);
  line(g, 0, 2, 1, 2);
}

/** IEC NOT gate in notGateView's frame: input at (0, 0), output at (4, 0). */
export function drawNotIec(g: SymbolGraphics): void {
  line(g, 0, 0, 1, 0);
  rectPath(g, 1, -1, 2.2, 2);
  g.stroke("symbol");
  g.text("1", 2.1, 0, { size: 0.7, align: "center", baseline: "middle" });
  circle(g, 3.4, 0, 0.2);
  line(g, 3.6, 0, 4, 0);
}
