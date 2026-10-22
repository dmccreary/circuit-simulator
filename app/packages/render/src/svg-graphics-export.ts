// The schematic as a standalone SVG document (FIL-11, FIL-12): wires, crossing
// gaps, symbols in the chosen style, labels and values, junction dots, and
// optionally the voltage colors of a display state. Built from the same views
// and placement code the canvas uses.

import type { CircuitDocument, CompiledCircuit, Part, Point } from "@cs/model";
import { pointKey } from "@cs/model";
import type { Box } from "@cs/elements";
import { formatValue } from "@cs/units";
import { affineFrom } from "./canvas-graphics";
import { findWireCrossings } from "./crossings";
import { placeLabels, segmentBox, type LabelRequest } from "./label-placement";
import { partBox, type ElementAccess } from "./schematic";
import { SvgSymbolGraphics, escapeXml, n4 } from "./svg-graphics";
import type { Theme } from "./theme";
import { voltageColor } from "./theme";

export interface SvgExportOptions {
  style?: "ansi" | "iec" | "lifelike";
  /** Color wires by voltage from this display state (ANI-12). */
  display?: ArrayLike<number>;
  compiled?: CompiledCircuit;
  /** Voltage scale half-range; default the largest |V| in the display. */
  voltageRange?: number;
  /** Show part values beside the labels (default true). */
  values?: boolean;
  /** Margin around the circuit, grid units. */
  padding?: number;
  /** Pixels per grid unit for the width/height attributes. */
  pxPerGrid?: number;
  /** Only this area (grid units), e.g. the current view; default the whole circuit. */
  area?: Box;
}

const WIRE_W = 0.14;
const LABEL_SIZE = 0.6;

/** Bounding box of everything drawn, grid units. */
export function documentBox(doc: CircuitDocument, access: ElementAccess): Box | undefined {
  const pts: Point[] = [];
  for (const w of Object.values(doc.wires)) pts.push(...w.points);
  for (const p of Object.values(doc.parts)) {
    const b = partBox(p, access.getView(p.type), access);
    pts.push({ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h });
  }
  for (const a of Object.values(doc.annotations ?? {})) pts.push(a.at);
  if (!pts.length) return undefined;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function canvasValues(part: Part, access: ElementAccess): string[] {
  const d = access.getDescriptor(part.type);
  const out: string[] = [];
  for (const spec of d?.props ?? []) {
    const v = part.props[spec.key];
    if (spec.showOnCanvas && typeof v === "number") out.push(formatValue(v, spec.unit, { trimZeros: true }));
    else if (spec.showOnCanvas && typeof v === "string" && spec.kind === "enum") out.push(v);
  }
  return out;
}

export function schematicToSvg(doc: CircuitDocument, access: ElementAccess, theme: Theme, opts: SvgExportOptions = {}): string {
  const pad = opts.padding ?? 2;
  const content = opts.area ?? documentBox(doc, access) ?? { x: 0, y: 0, w: 10, h: 10 };
  const vb = { x: content.x - pad, y: content.y - pad, w: content.w + 2 * pad, h: content.h + 2 * pad };
  const px = opts.pxPerGrid ?? 16;
  const parts: string[] = [];
  const display = opts.display;
  const compiled = opts.compiled;
  let range = opts.voltageRange ?? 0;
  if (display && compiled && !range) for (let i = 1; i <= compiled.netlist.nodeCount; i++) range = Math.max(range, Math.abs(display[i] ?? 0));
  const segNode = new Map<string, number>();
  for (const s of compiled?.segments ?? []) segNode.set(`${s.wire}:${s.segment}`, s.node);
  const wireColor = (wire: string, seg: number): string => {
    const node = segNode.get(`${wire}:${seg}`);
    if (!display || node === undefined || !(range > 0)) return theme.tokens.wire;
    return voltageColor(theme, display[node] ?? 0, range);
  };

  parts.push(`<rect x="${n4(vb.x)}" y="${n4(vb.y)}" width="${n4(vb.w)}" height="${n4(vb.h)}" fill="${theme.tokens.background}"/>`);

  // Wires, one path per segment so each can carry its node's color.
  parts.push(`<g fill="none" stroke-width="${WIRE_W}" stroke-linecap="round">`);
  for (const w of Object.values(doc.wires)) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      parts.push(`<path d="M${n4(a.x)} ${n4(a.y)}L${n4(b.x)} ${n4(b.y)}" stroke="${wireColor(w.id, i)}"/>`);
    }
  }
  // Crossings without a junction: a gap in the vertical wire (CAN-10).
  for (const c of findWireCrossings(Object.values(doc.wires))) {
    const g = 0.3;
    parts.push(`<rect x="${n4(c.at.x - WIRE_W)}" y="${n4(c.at.y - g)}" width="${n4(2 * WIRE_W)}" height="${n4(2 * g)}" fill="${theme.tokens.background}" stroke="none"/>`);
    parts.push(`<path d="M${n4(c.at.x - g)} ${n4(c.at.y)}L${n4(c.at.x + g)} ${n4(c.at.y)}" stroke="${wireColor(c.over.wire, c.over.segment)}"/>`);
  }
  parts.push(`</g>`);

  // Symbols.
  const texts: string[] = [];
  for (const part of Object.values(doc.parts)) {
    const view = access.getView(part.type);
    const m = affineFrom((p) => access.localToDocument(part, p));
    const g = new SvgSymbolGraphics(theme);
    g.setFrame(m);
    if (view) view.drawSymbol(g, part, opts.style ?? "ansi");
    else {
      g.beginPath();
      g.moveTo(-0.5, -0.5);
      g.lineTo(0.5, -0.5);
      g.lineTo(0.5, 0.5);
      g.lineTo(-0.5, 0.5);
      g.closePath();
      g.stroke("symbol");
    }
    parts.push(`<g transform="matrix(${m.map(n4).join(" ")})">${g.out.join("")}</g>`);
    texts.push(...g.texts);
  }

  // Labels and values, placed to avoid symbols and wires (CAN-08).
  const charW = 0.55 * LABEL_SIZE;
  const boxes = Object.values(doc.parts).map((p) => partBox(p, access.getView(p.type), access));
  const obstacles: Box[] = [...boxes];
  for (const w of Object.values(doc.wires))
    for (let i = 0; i + 1 < w.points.length; i++) obstacles.push(segmentBox(w.points[i].x, w.points[i].y, w.points[i + 1].x, w.points[i + 1].y, 0.1));
  const reqs: LabelRequest[] = [];
  Object.values(doc.parts).forEach((part, i) => {
    const lines = [part.label, ...(opts.values === false ? [] : canvasValues(part, access))].filter(Boolean);
    if (!lines.length) return;
    const box = boxes[i];
    const fixed = part.labelOffset ? { x: box.x + box.w / 2 + part.labelOffset.x, y: box.y + box.h / 2 + part.labelOffset.y } : undefined;
    reqs.push({ id: part.id, box, lines, widths: lines.map((l) => l.length * charW), lineHeight: LABEL_SIZE * 1.15, fixed });
  });
  for (const pl of placeLabels(reqs, obstacles)) {
    pl.lines.forEach((line, i) => {
      const y = pl.box.y + (i + 0.5) * pl.lineHeight;
      const color = i === 0 ? theme.tokens.label : theme.tokens.value;
      texts.push(`<text x="${n4(pl.box.x + pl.box.w / 2)}" y="${n4(y)}" font-size="${LABEL_SIZE}" text-anchor="middle" dominant-baseline="central" fill="${color}">${escapeXml(line)}</text>`);
    });
  }

  // Annotations (CAN-13).
  for (const a of Object.values(doc.annotations ?? {})) {
    if (a.kind === "text" && a.text) texts.push(`<text x="${n4(a.at.x)}" y="${n4(a.at.y)}" font-size="${LABEL_SIZE}" fill="${theme.tokens.label}">${escapeXml(a.text)}</text>`);
    else if (a.kind === "box" && a.size)
      parts.push(`<rect x="${n4(a.at.x)}" y="${n4(a.at.y)}" width="${n4(a.size.x)}" height="${n4(a.size.y)}" fill="none" stroke="${theme.tokens.label}" stroke-width="0.06" stroke-dasharray="0.3 0.2"/>`);
  }

  // Junction dots (CAN-10).
  const count = new Map<string, number>();
  const bump = (p: Point, k = 1) => void count.set(pointKey(p), (count.get(pointKey(p)) ?? 0) + k);
  for (const w of Object.values(doc.wires)) w.points.forEach((p, i) => bump(p, i > 0 && i < w.points.length - 1 ? 2 : 1));
  for (const part of Object.values(doc.parts)) {
    const d = access.getDescriptor(part.type);
    if (d) access.terminalPositions(part, d).forEach((p) => bump(p));
  }
  for (const [k, c] of count) {
    if (c < 3) continue;
    const [x, y] = k.split(",").map(Number);
    parts.push(`<circle cx="${n4(x)}" cy="${n4(y)}" r="0.2" fill="${theme.junction}"/>`);
  }

  const title = escapeXml(doc.meta?.title || "Circuit");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n4(vb.x)} ${n4(vb.y)} ${n4(vb.w)} ${n4(vb.h)}" width="${Math.round(vb.w * px)}" height="${Math.round(vb.h * px)}" font-family="${escapeXml(theme.font)}">`,
    `<title>${title}</title>`,
    ...parts,
    ...texts,
    `</svg>`,
  ].join("\n");
}
