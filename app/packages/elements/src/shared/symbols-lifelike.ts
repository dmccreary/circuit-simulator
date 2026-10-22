// Lifelike pictures of the Essentials (CAN-14, rendering.md §2.5), drawn with
// the same primitives as the symbols, so no image assets are needed and the
// canvas, the SVG export and print all draw them. Same positions and
// terminals as the schematic symbols; parts without a picture keep theirs.

import type { Part } from "@cs/model";
import type { SymbolGraphics } from "../api";
import { colorBands, BAND_CSS } from "./color-bands";
import { circlePath, fillCss, rectPath, roundRectPath, strokeCss } from "./graphics-ext";
import { num, str } from "./props";
import { isClosed } from "./switchState";
import { lengthOf } from "./viewKit";
import type { SymbolDrawer } from "./symbols-iec";

const LEAD = "#9aa0a6";
const LEAD_W = 0.09;

/** Tinned leads from each terminal to a body of half-width `half`; returns the centre x. */
function wireLeads(g: SymbolGraphics, part: Part, half: number): number {
  const L = lengthOf(part);
  const c = L / 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(c - half, 0);
  g.moveTo(c + half, 0);
  g.lineTo(L, 0);
  strokeCss(g, LEAD, LEAD_W, "wire");
  return c;
}

/** Beige body with four color bands computed from the resistance. */
const resistor: SymbolDrawer = (g, part) => {
  const c = wireLeads(g, part, 1.1);
  roundRectPath(g, c - 1.1, -0.38, 2.2, 0.76, 0.3);
  fillCss(g, "#dcc196", "background");
  strokeCss(g, "#8d6e48", 0.05);
  const bands = colorBands(num(part.props, "resistance", 1000));
  const xs = [c - 0.7, c - 0.4, c - 0.1, c + 0.5];
  bands.forEach((b, i) => {
    rectPath(g, xs[i] - 0.09, -0.36, 0.18, 0.72);
    fillCss(g, BAND_CSS[b], "symbol");
  });
};

/** A cylindrical cell: "+" nub and copper cap at terminal 0. */
const battery: SymbolDrawer = (g, part) => {
  const c = wireLeads(g, part, 1.5);
  rectPath(g, c - 1.5, -0.25, 0.2, 0.5);
  fillCss(g, "#b0bec5", "symbol");
  roundRectPath(g, c - 1.3, -0.65, 2.7, 1.3, 0.15);
  fillCss(g, "#263238", "symbol", 0.9);
  strokeCss(g, "#111", 0.05);
  rectPath(g, c - 1.3, -0.65, 0.55, 1.3);
  fillCss(g, "#c77d32", "symbol");
  g.text("+", c - 1.0, 0, { size: 0.6, align: "center", baseline: "middle", color: "background" });
  g.text(`${num(part.props, "voltage", 9)} V`, c + 0.35, 0, { size: 0.45, align: "center", baseline: "middle", color: "background" });
};

/** A bulb: glass envelope, screw base and filament. */
const lamp: SymbolDrawer = (g, part) => {
  const c = wireLeads(g, part, 0.5);
  circlePath(g, c, -0.2, 0.85);
  fillCss(g, "#fffde7", "background", 0.7);
  strokeCss(g, "#9e9e9e", 0.06);
  rectPath(g, c - 0.45, 0.45, 0.9, 0.5);
  fillCss(g, "#9e9e9e", "symbol");
  g.beginPath();
  g.moveTo(c - 0.3, 0.45);
  g.lineTo(c - 0.3, -0.2);
  for (let k = 0; k <= 4; k++) g.lineTo(c - 0.3 + 0.15 * k, k % 2 ? -0.45 : -0.25);
  g.lineTo(c + 0.3, 0.45);
  strokeCss(g, "#5d4037", 0.05);
};

export const LED_CSS: Record<string, string> = {
  red: "#e53935",
  orange: "#fb8c00",
  yellow: "#fdd835",
  green: "#43a047",
  blue: "#1e88e5",
  white: "#eceff1",
  infrared: "#6d4c41",
  custom: "#e53935",
};

/** A 5 mm LED seen from the side: colored dome on a rim, anode lead longer. */
const led: SymbolDrawer = (g, part) => {
  const c = wireLeads(g, part, 0.6);
  const color = LED_CSS[str(part.props, "color", "red")] ?? LED_CSS.red;
  g.beginPath();
  g.moveTo(c - 0.6, 0.45);
  g.arc(c, -0.1, 0.6, Math.PI, 0);
  g.lineTo(c + 0.6, 0.45);
  g.closePath();
  fillCss(g, color, "glow", 0.85);
  strokeCss(g, "#424242", 0.05);
  rectPath(g, c - 0.75, 0.45, 1.5, 0.22);
  fillCss(g, color, "symbol");
};

/** Ceramic disc below 1 µF, otherwise an electrolytic can with its stripe. */
const capacitor: SymbolDrawer = (g, part) => {
  const C = num(part.props, "capacitance", 10e-6);
  if (C < 1e-6) {
    const c = wireLeads(g, part, 0.7);
    circlePath(g, c, 0, 0.7);
    fillCss(g, "#e0a040", "symbol");
    strokeCss(g, "#a86a1a", 0.05);
    return;
  }
  const c = wireLeads(g, part, 1.1);
  roundRectPath(g, c - 1.1, -0.65, 2.2, 1.3, 0.2);
  fillCss(g, "#1e3a8a", "symbol");
  strokeCss(g, "#0d1b4a", 0.05);
  rectPath(g, c + 0.55, -0.65, 0.35, 1.3);
  fillCss(g, "#cfd8dc", "background");
};

/** A diode: black glass body, silver cathode band at terminal 1. */
const diode: SymbolDrawer = (g, part) => {
  const c = wireLeads(g, part, 0.8);
  roundRectPath(g, c - 0.8, -0.3, 1.6, 0.6, 0.12);
  fillCss(g, "#212121", "symbol");
  rectPath(g, c + 0.4, -0.3, 0.2, 0.6);
  fillCss(g, "#cfd8dc", "background");
};

/** A toggle switch: base plate and a lever that points to its state. */
const toggle: SymbolDrawer = (g, part) => {
  const c = wireLeads(g, part, 1);
  roundRectPath(g, c - 1, -0.4, 2, 0.8, 0.15);
  fillCss(g, "#424242", "symbol");
  const closed = isClosed(part.type, part.props);
  const tipX = closed ? c + 0.55 : c - 0.55;
  g.beginPath();
  g.moveTo(c, 0);
  g.lineTo(tipX, -1);
  strokeCss(g, "#bdbdbd", 0.18);
  circlePath(g, tipX, -1, 0.18);
  fillCss(g, "#eeeeee", "background");
};

/** A tactile push button: square body with a round cap. */
const pushButton: SymbolDrawer = (g, part) => {
  const c = wireLeads(g, part, 0.8);
  rectPath(g, c - 0.8, -0.6, 1.6, 1.2);
  fillCss(g, "#37474f", "symbol");
  circlePath(g, c, 0, isClosed(part.type, part.props) ? 0.38 : 0.45);
  fillCss(g, "#e53935", "symbol");
};

export const LIFELIKE_SYMBOLS: Record<string, SymbolDrawer> = {
  resistor,
  battery,
  lamp,
  led,
  capacitor,
  diode,
  switch: toggle,
  "push-button": pushButton,
};
