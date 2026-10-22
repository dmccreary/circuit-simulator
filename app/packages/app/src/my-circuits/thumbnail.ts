// A small schematic drawing for the My circuits list (FIL-08): wires and each
// part's terminals joined, fitted into a fixed box. Plain SVG text, so it is
// stored as is and shown with a data: URL.

import type { CircuitDocument, Part, Point } from "@cs/model";

export function thumbnailSvg(doc: CircuitDocument, terminals: (p: Part) => Point[], width = 160, height = 100): string {
  const lines: Point[][] = [];
  const dots: Point[] = [];
  for (const w of Object.values(doc.wires)) if (w.points.length >= 2) lines.push(w.points);
  for (const p of Object.values(doc.parts)) {
    let pts: Point[] = [];
    try {
      pts = terminals(p);
    } catch {
      pts = [];
    }
    if (pts.length >= 2) lines.push(pts);
    else dots.push(pts[0] ?? p.at);
  }
  const all = [...lines.flat(), ...dots];
  const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"></svg>`;
  if (!all.length) return empty;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const x0 = Math.min(...xs) - 1;
  const y0 = Math.min(...ys) - 1;
  const w = Math.max(Math.max(...xs) + 1 - x0, 1);
  const h = Math.max(Math.max(...ys) + 1 - y0, 1);
  const k = Math.min(width / w, height / h);
  const ox = (width - w * k) / 2;
  const oy = (height - h * k) / 2;
  const f = (v: number) => Math.round(v * 10) / 10;
  const pt = (p: Point) => `${f(ox + (p.x - x0) * k)},${f(oy + (p.y - y0) * k)}`;
  const body = [
    ...lines.map((l) => `<polyline points="${l.map(pt).join(" ")}"/>`),
    ...dots.map((p) => {
      const [x, y] = pt(p).split(",");
      return `<circle cx="${x}" cy="${y}" r="2"/>`;
    }),
  ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g fill="none" stroke="#3a6ea5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}

export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
