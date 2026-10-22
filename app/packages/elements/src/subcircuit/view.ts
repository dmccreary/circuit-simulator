import type { Part } from "@cs/model";
import { blockBody, decodeLayout, pinPoint } from "@cs/model";
import type { Box, ElementView, SymbolGraphics } from "../api";

const SIZE = 0.55;

function drawBlock(g: SymbolGraphics, part: Part): void {
  const l = decodeLayout(part.props.pinLayout);
  const b = blockBody(l);
  g.beginPath();
  g.moveTo(b.x, b.y);
  g.lineTo(b.x + b.w, b.y);
  g.lineTo(b.x + b.w, b.y + b.h);
  g.lineTo(b.x, b.y + b.h);
  g.closePath();
  g.fill("background", 0.85);
  g.stroke("symbol");
  for (const p of l.pins) {
    const t = pinPoint(l, p);
    // Lead from the terminal to the body edge, and the pin name just inside it.
    const edge = p.side === "left" ? { x: b.x, y: t.y } : p.side === "right" ? { x: b.x + b.w, y: t.y } : p.side === "top" ? { x: t.x, y: b.y } : { x: t.x, y: b.y + b.h };
    g.beginPath();
    g.moveTo(t.x, t.y);
    g.lineTo(edge.x, edge.y);
    g.stroke("symbol");
    const inset = 0.25;
    if (p.side === "left") g.text(p.name, edge.x + inset, t.y, { size: SIZE, align: "left", baseline: "middle", color: "label" });
    else if (p.side === "right") g.text(p.name, edge.x - inset, t.y, { size: SIZE, align: "right", baseline: "middle", color: "label" });
    else if (p.side === "top") g.text(p.name, t.x, edge.y + inset, { size: SIZE, align: "center", baseline: "top", color: "label" });
    else g.text(p.name, t.x, edge.y - inset, { size: SIZE, align: "center", baseline: "bottom", color: "label" });
  }
  const name = typeof part.props.name === "string" ? part.props.name : "";
  if (name) g.text(name, b.x + b.w / 2, b.y + b.h / 2, { size: 0.6, align: "center", baseline: "middle", color: "value" });
}

function hitShape(part: Part): Box {
  const l = decodeLayout(part.props.pinLayout);
  const b = blockBody(l);
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

export const subcircuitView: ElementView = {
  drawSymbol: (g, part) => drawBlock(g, part),
  // No drawn current paths: the current flows through the parts inside.
  currentPaths: () => [],
  hitShape,
  describe: (part) => ({
    key: "element.subcircuit.describe",
    values: { label: part.label, name: typeof part.props.name === "string" ? part.props.name : "", pins: decodeLayout(part.props.pinLayout).pins.length },
  }),
};
