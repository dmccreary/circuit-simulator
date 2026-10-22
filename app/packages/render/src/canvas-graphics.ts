import type { Point } from "@cs/model";
import type { ColorToken, SymbolGraphics, TextStyle } from "@cs/elements";
import type { Theme } from "./theme";

/** 2-D affine map [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f (canvas order). */
export type Affine = [number, number, number, number, number, number];

/** Build the local→screen affine from any point map that is affine (rotation, flip, translate, scale). */
export function affineFrom(map: (p: Point) => Point): Affine {
  const o = map({ x: 0, y: 0 });
  const ex = map({ x: 1, y: 0 });
  const ey = map({ x: 0, y: 1 });
  return [ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y];
}

export const applyAffine = (m: Affine, p: Point): Point => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

/** Default stroke width, grid units. */
const STROKE = 0.12;

/**
 * SymbolGraphics drawn on a 2-D canvas. Paths are drawn in the part's local
 * frame via setTransform, so rotation and flip come for free; text is drawn
 * upright at the transformed anchor so labels never appear mirrored.
 */
export class CanvasSymbolGraphics implements SymbolGraphics {
  private m: Affine = [1, 0, 0, 1, 0, 0];
  /** Screen px per grid unit (before devicePixelRatio). */
  private scale = 16;
  /** Overrides every color token (selection highlight). */
  tint: string | undefined;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private theme: Theme,
    private dpr = 1,
  ) {}

  setTheme(t: Theme): void {
    this.theme = t;
  }

  /** `m` maps local grid coordinates to CSS pixels. */
  setFrame(m: Affine): void {
    this.m = m;
    this.scale = Math.hypot(m[0], m[1]);
    const d = this.dpr;
    this.ctx.setTransform(m[0] * d, m[1] * d, m[2] * d, m[3] * d, m[4] * d, m[5] * d);
  }

  color(token: ColorToken | undefined, fallback: ColorToken): string {
    return this.tint ?? this.theme.tokens[token ?? fallback];
  }

  beginPath(): void {
    this.ctx.beginPath();
  }
  moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y);
  }
  lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y);
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw?: boolean): void {
    this.ctx.arc(cx, cy, r, a0, a1, ccw);
  }
  closePath(): void {
    this.ctx.closePath();
  }
  stroke(color?: ColorToken, width?: number): void {
    const c = this.ctx;
    c.strokeStyle = this.color(color, "symbol");
    // Keep lines at least ~1.2 px when zoomed far out.
    c.lineWidth = Math.max(width ?? STROKE, 1.2 / this.scale);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.stroke();
  }
  fill(color?: ColorToken, alpha?: number): void {
    const c = this.ctx;
    c.globalAlpha = alpha ?? 1;
    c.fillStyle = this.color(color, "symbol");
    c.fill();
    c.globalAlpha = 1;
  }
  text(s: string, x: number, y: number, style?: TextStyle): void {
    const p = applyAffine(this.m, { x, y });
    const c = this.ctx;
    c.save();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const px = (style?.size ?? 0.6) * this.scale;
    if (px < 6) {
      c.restore();
      return; // unreadable; hidden until zoomed in (ANI-23)
    }
    c.font = `${px.toFixed(1)}px ${this.theme.font}`;
    c.fillStyle = this.color(style?.color, "label");
    c.textAlign = style?.align ?? "center";
    c.textBaseline = style?.baseline ?? "middle";
    c.fillText(s, p.x, p.y);
    c.restore();
  }
}
