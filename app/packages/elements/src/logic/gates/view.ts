import type { Part } from "@cs/model";
import type { ElementView, SymbolGraphics } from "../../api";
import { shiftX, stretchOf } from "../../shared/stretch";
import { line } from "../../shared/viewKit";
import { bubble, describeLogic, drawGate } from "../symbols";
import { drawGateIec, drawNotIec } from "../../shared/symbols-iec";
import { GATE_LENGTH, gateInputs, gateLayout } from "./geometry";

/**
 * The two-input body is centred on the axis between the input and output
 * columns; stretched parts get longer leads, and extra inputs get leads to the
 * body's back edge, which grows to cover them.
 */
function drawWideGate(g0: SymbolGraphics, part: Part, shape: "and" | "or" | "xor", inverted: boolean, iec = false): void {
  const n = gateInputs(part.type);
  const { inputs, axis } = gateLayout(n);
  const e = stretchOf(part, GATE_LENGTH);
  const half = e / 2;
  (iec ? drawGateIec : drawGate)(shiftX(g0, half, axis - 1), shape, inverted);
  if (half > 0) {
    for (const y of inputs) if (Math.abs(y - axis) === 1) line(g0, 0, y, half, y);
    line(g0, GATE_LENGTH + half, axis, GATE_LENGTH + e, axis);
  }
  if (n !== 2) {
    const top = Math.min(...inputs);
    const bottom = Math.max(...inputs);
    line(g0, half + 1, top - 0.5, half + 1, bottom + 0.5);
    for (const y of inputs) if (Math.abs(y - axis) !== 1) line(g0, 0, y, half + 1, y);
  }
}

function gateView(shape: "and" | "or" | "xor", inverted: boolean): ElementView {
  return {
    drawSymbol: (g, part, style) => drawWideGate(g, part, shape, inverted, style === "iec"),
    currentPaths: () => [],
    hitShape: (part) => {
      const { inputs } = gateLayout(gateInputs(part.type));
      const bottom = Math.max(...inputs);
      return { x: 0, y: -0.6, w: Math.max(1, GATE_LENGTH + stretchOf(part, GATE_LENGTH)), h: bottom + 1.2 };
    },
    describe: (part) => describeLogic(part),
  };
}

export const andGateView = gateView("and", false);
export const orGateView = gateView("or", false);
export const nandGateView = gateView("and", true);
export const norGateView = gateView("or", true);
export const xorGateView = gateView("xor", false);

export const notGateView: ElementView = {
  drawSymbol(g0, part, style) {
    const e = stretchOf(part, GATE_LENGTH);
    const half = e / 2;
    const g = shiftX(g0, half);
    if (half > 0) line(g0, 0, 0, half, 0);
    if (style === "iec") {
      drawNotIec(g);
      if (half > 0) line(g0, GATE_LENGTH + half, 0, GATE_LENGTH + e, 0);
      return;
    }
    line(g, 0, 0, 1, 0);
    g.beginPath();
    g.moveTo(1, -1);
    g.lineTo(3.2, 0);
    g.lineTo(1, 1);
    g.closePath();
    g.stroke("symbol");
    line(g, bubble(g, 3.2, 0), 0, 4, 0);
    if (half > 0) line(g0, GATE_LENGTH + half, 0, GATE_LENGTH + e, 0);
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -1.1, w: Math.max(1, GATE_LENGTH + stretchOf(part, GATE_LENGTH)), h: 2.2 }),
  describe: (part) => describeLogic(part),
};
