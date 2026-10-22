export type Layer = "grid" | "symbols" | "live" | "dots" | "overlay" | "chart";

export const LAYERS: Layer[] = ["grid", "symbols", "live", "dots", "overlay", "chart"];

/** Advances an animation; return true while it still needs frames. */
export type Ticker = (dtSeconds: number, nowSeconds: number) => boolean;

export interface FrameClock {
  request(cb: (timeMs: number) => void): number;
  cancel(handle: number): void;
}

const browserClock: FrameClock = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h),
};

/**
 * One rAF loop for every canvas of a simulator instance (rendering.md §1).
 * It draws only invalidated layers and sleeps when nothing is dirty and no
 * ticker is animating.
 */
export class RenderScheduler {
  private dirty = new Set<Layer>();
  private drawers = new Map<Layer, Array<() => void>>();
  private tickers = new Set<Ticker>();
  private handle: number | undefined;
  private lastMs: number | undefined;
  private visible = true;
  private _animating = false;

  constructor(private clock: FrameClock = browserClock) {}

  get animating(): boolean {
    return this._animating;
  }

  /** Register a draw function for a layer; returns an unregister function. */
  onDraw(layer: Layer, fn: () => void): () => void {
    const list = this.drawers.get(layer) ?? [];
    list.push(fn);
    this.drawers.set(layer, list);
    this.invalidate(layer);
    return () => {
      const l = this.drawers.get(layer);
      if (l) l.splice(l.indexOf(fn), 1);
    };
  }

  addTicker(t: Ticker): () => void {
    this.tickers.add(t);
    this.wake();
    return () => this.tickers.delete(t);
  }

  invalidate(...what: Layer[]): void {
    for (const w of what) this.dirty.add(w);
    this.wake();
  }

  invalidateAll(): void {
    this.invalidate(...LAYERS);
  }

  /** Tickers may want frames again (e.g. new currents arrived). */
  wake(): void {
    if (this.handle !== undefined || !this.visible) return;
    this.handle = this.clock.request((ms) => this.frame(ms));
  }

  /** Off-screen or hidden pages stop drawing (EMB-07). */
  setVisible(v: boolean): void {
    this.visible = v;
    if (!v && this.handle !== undefined) {
      this.clock.cancel(this.handle);
      this.handle = undefined;
      this.lastMs = undefined;
    } else if (v) this.wake();
  }

  dispose(): void {
    this.setVisible(false);
    this.tickers.clear();
    this.drawers.clear();
  }

  private frame(ms: number): void {
    this.handle = undefined;
    // Cap dt so a long sleep doesn't make dots jump.
    const dt = this.lastMs === undefined ? 0 : Math.min(0.1, (ms - this.lastMs) / 1000);
    let animating = false;
    for (const t of this.tickers) if (t(dt, ms / 1000)) animating = true;
    this._animating = animating;
    if (animating) this.dirty.add("dots");
    const todo = LAYERS.filter((l) => this.dirty.has(l));
    this.dirty.clear();
    for (const l of todo) for (const fn of this.drawers.get(l) ?? []) fn();
    if (animating || this.dirty.size > 0) {
      this.lastMs = ms;
      this.handle = this.clock.request((m) => this.frame(m));
    } else {
      this.lastMs = undefined;
    }
  }
}
