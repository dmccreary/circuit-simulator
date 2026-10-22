// SymbolGraphics that writes SVG (rendering.md §2.3): the same view code that
// draws the canvas draws the exported schematic (FIL-11) and the printed page
// (FIL-12). Coordinates stay in grid units; the caller wraps each part in a
// <g transform> for its orientation and position.

import type { ColorToken, RichGraphics, TextStyle } from "@cs/elements";
import type { Affine } from "./canvas-graphics";
import { applyAffine } from "./canvas-graphics";
import type { Theme } from "./theme";

const STROKE = 0.12;

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Round to 4 decimals, dropping trailing zeros, so the file stays small. */
export const n4 = (v: number): string => String(Math.round(v * 1e4) / 1e4);

export class SvgSymbolGraphics implements RichGraphics {
  readonly rich = true as const;
  /** Elements written so far (path and text markup). */
  readonly out: string[] = [];
  /** Text is written upright, outside the part's group, through this map. */
  private m: Affine = [1, 0, 0, 1, 0, 0];
  private d: string[] = [];
  private cur: { x: number; y: number } | undefined;
  tint: string | undefined;

  constructor(private theme: Theme) {}

  /** Local→document map of the part being drawn (for upright text). */
  setFrame(m: Affine): void {
    this.m = m;
  }

  private color(token: ColorToken | undefined, fallback: ColorToken): string {
    return this.tint ?? this.theme.tokens[token ?? fallback];
  }

  beginPath(): void {
    this.d = [];
    this.cur = undefined;
  }
  moveTo(x: number, y: number): void {
    this.d.push(`M${n4(x)} ${n4(y)}`);
    this.cur = { x, y };
  }
  lineTo(x: number, y: number): void {
    this.d.push(`${this.cur ? "L" : "M"}${n4(x)} ${n4(y)}`);
    this.cur = { x, y };
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false): void {
    const sx = cx + r * Math.cos(a0);
    const sy = cy + r * Math.sin(a0);
    this.d.push(`${this.cur ? "L" : "M"}${n4(sx)} ${n4(sy)}`);
    // Canvas angles grow clockwise on screen (y down), as does SVG's sweep-flag 1.
    let sweep = ccw ? a0 - a1 : a1 - a0;
    const TAU = 2 * Math.PI;
    if (sweep >= TAU - 1e-9) sweep = TAU;
    else sweep = ((sweep % TAU) + TAU) % TAU;
    const flag = ccw ? 0 : 1;
    const dir = ccw ? -1 : 1;
    const arcTo = (a: number, large: number) => {
      const ex = cx + r * Math.cos(a);
      const ey = cy + r * Math.sin(a);
      this.d.push(`A${n4(r)} ${n4(r)} 0 ${large} ${flag} ${n4(ex)} ${n4(ey)}`);
      this.cur = { x: ex, y: ey };
    };
    if (sweep >= TAU - 1e-9) {
      arcTo(a0 + dir * Math.PI, 0); // a full circle is two half arcs
      arcTo(a0 + dir * TAU, 0);
    } else if (sweep > 0) arcTo(a0 + dir * sweep, sweep > Math.PI ? 1 : 0);
  }
  closePath(): void {
    this.d.push("Z");
  }

  private path(attrs: string): void {
    if (this.d.length) this.out.push(`<path d="${this.d.join("")}" ${attrs}/>`);
  }

  stroke(color?: ColorToken, width?: number): void {
    this.path(`fill="none" stroke="${this.color(color, "symbol")}" stroke-width="${n4(width ?? STROKE)}" stroke-linecap="round" stroke-linejoin="round"`);
  }
  fill(color?: ColorToken, alpha?: number): void {
    this.path(`fill="${this.color(color, "symbol")}"${alpha !== undefined && alpha < 1 ? ` fill-opacity="${n4(alpha)}"` : ""}`);
  }
  strokeCss(css: string, width?: number): void {
    this.path(`fill="none" stroke="${escapeXml(css)}" stroke-width="${n4(width ?? STROKE)}" stroke-linecap="round" stroke-linejoin="round"`);
  }
  fillCss(css: string, alpha?: number): void {
    this.path(`fill="${escapeXml(css)}"${alpha !== undefined && alpha < 1 ? ` fill-opacity="${n4(alpha)}"` : ""}`);
  }

  /** Text is collected separately: drawn upright at the transformed anchor, like the canvas. */
  readonly texts: string[] = [];
  text(s: string, x: number, y: number, style?: TextStyle): void {
    const p = applyAffine(this.m, { x, y });
    const anchor = style?.align === "left" ? "start" : style?.align === "right" ? "end" : "middle";
    const base = style?.baseline === "top" ? "hanging" : style?.baseline === "bottom" ? "text-after-edge" : "central";
    this.texts.push(
      `<text x="${n4(p.x)}" y="${n4(p.y)}" font-size="${n4(style?.size ?? 0.6)}" text-anchor="${anchor}" dominant-baseline="${base}" fill="${this.color(style?.color, "label")}">${escapeXml(s)}</text>`,
    );
  }
}
