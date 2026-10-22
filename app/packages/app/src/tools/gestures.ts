import type { Point } from "@cs/model";

export interface PanZoomView {
  panBy(dx: number, dy: number): void;
  zoomAbout(screen: Point, factor: number): void;
}

/**
 * Two-finger pan and pinch zoom (RSP-14, app-shell.md §5.2). Sits in front of
 * the tools: once a second finger lands, the tool's gesture is cancelled and
 * every pointer is consumed until all fingers lift.
 */
export class TouchGestures {
  private pts = new Map<number, Point>();
  private active = false;
  private last: { c: Point; dist: number } | undefined;

  constructor(
    private view: () => PanZoomView | undefined,
    private hooks: { begin(): void; changed(): void },
  ) {}

  get engaged(): boolean {
    return this.active;
  }

  /** Returns true when the event belongs to the gesture and must not reach the tool. */
  down(id: number, p: Point): boolean {
    this.pts.set(id, p);
    if (this.pts.size === 2 && !this.active) {
      this.active = true;
      this.hooks.begin();
      this.last = this.measure();
      return true;
    }
    return this.active;
  }

  move(id: number, p: Point): boolean {
    if (!this.pts.has(id)) return this.active;
    this.pts.set(id, p);
    if (!this.active) return false;
    const now = this.measure();
    const v = this.view();
    if (now && this.last && v) {
      v.panBy(now.c.x - this.last.c.x, now.c.y - this.last.c.y);
      if (this.last.dist > 0 && now.dist > 0) v.zoomAbout(now.c, now.dist / this.last.dist);
      this.hooks.changed();
    }
    this.last = now;
    return true;
  }

  up(id: number): boolean {
    this.pts.delete(id);
    const consumed = this.active;
    if (this.pts.size === 0) this.active = false;
    this.last = this.measure();
    return consumed;
  }

  private measure(): { c: Point; dist: number } | undefined {
    if (this.pts.size < 2) return undefined;
    const [a, b] = [...this.pts.values()];
    return { c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }
}

const installed = new WeakSet<HTMLElement>();

/** Attach the gesture layer to the schematic host in the capture phase, ahead of the tool handlers. */
export function installTouchGestures(host: HTMLElement, view: () => PanZoomView | undefined, hooks: { begin(): void; changed(): void }): void {
  if (installed.has(host)) return;
  installed.add(host);
  const g = new TouchGestures(view, hooks);
  const local = (e: PointerEvent): Point => {
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const swallow = (e: PointerEvent, consumed: boolean) => {
    if (!consumed) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  };
  const touch = (e: PointerEvent) => e.pointerType === "touch";
  host.addEventListener("pointerdown", (e) => touch(e) && swallow(e, g.down(e.pointerId, local(e))), { capture: true });
  host.addEventListener("pointermove", (e) => touch(e) && swallow(e, g.move(e.pointerId, local(e))), { capture: true });
  const up = (e: PointerEvent) => touch(e) && swallow(e, g.up(e.pointerId));
  host.addEventListener("pointerup", up, { capture: true });
  host.addEventListener("pointercancel", up, { capture: true });
}
