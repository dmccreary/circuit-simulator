import type { Point } from "@cs/model";

/** Screen pixels per grid unit at zoom 1 (100%). */
export const PX_PER_GRID = 16;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Grid units <-> CSS pixels. `offset` is the screen position of grid origin.
 * Pure: no DOM, so it is unit-tested in Node.
 */
export class ViewTransform {
  zoom = 1;
  offsetX = 0;
  offsetY = 0;
  width = 0;
  height = 0;

  get scale(): number {
    return PX_PER_GRID * this.zoom;
  }

  setViewport(width: number, height: number): void {
    const c = this.width && this.height ? this.center : undefined;
    this.width = width;
    this.height = height;
    if (c) this.center = c;
  }

  toScreen(p: Point): Point {
    return { x: p.x * this.scale + this.offsetX, y: p.y * this.scale + this.offsetY };
  }

  toGrid(p: Point): Point {
    return { x: (p.x - this.offsetX) / this.scale, y: (p.y - this.offsetY) / this.scale };
  }

  /** Nearest grid intersection to a screen point. */
  snap(screen: Point): Point {
    const g = this.toGrid(screen);
    return { x: Math.round(g.x), y: Math.round(g.y) };
  }

  /** Grid point shown at the middle of the viewport. */
  get center(): Point {
    return this.toGrid({ x: this.width / 2, y: this.height / 2 });
  }

  set center(c: Point) {
    this.offsetX = this.width / 2 - c.x * this.scale;
    this.offsetY = this.height / 2 - c.y * this.scale;
  }

  panBy(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  /** Zoom so the grid point under `screen` stays under it. */
  zoomAbout(screen: Point, factor: number): void {
    const anchor = this.toGrid(screen);
    this.zoom = clampZoom(this.zoom * factor);
    this.offsetX = screen.x - anchor.x * this.scale;
    this.offsetY = screen.y - anchor.y * this.scale;
  }

  setZoom(zoom: number): void {
    this.zoomAbout({ x: this.width / 2, y: this.height / 2 }, clampZoom(zoom) / this.zoom);
  }

  /** Fit a grid-space box into the viewport with a pixel margin. */
  fit(box: { x: number; y: number; w: number; h: number }, marginPx = 32): void {
    const w = Math.max(box.w, 1);
    const h = Math.max(box.h, 1);
    const zx = (this.width - 2 * marginPx) / (w * PX_PER_GRID);
    const zy = (this.height - 2 * marginPx) / (h * PX_PER_GRID);
    this.zoom = clampZoom(Math.min(zx, zy, 2));
    this.center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }

  /** The grid-space rectangle currently visible. */
  visibleBox(): { x: number; y: number; w: number; h: number } {
    const a = this.toGrid({ x: 0, y: 0 });
    return { x: a.x, y: a.y, w: this.width / this.scale, h: this.height / this.scale };
  }
}
