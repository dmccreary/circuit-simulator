import type { Point } from "@cs/model";
import type { CanvasPointer, Tool, ToolContext } from "./types";
import { routeL } from "./route";

type State = { kind: "idle" } | { kind: "drawing"; start: Point; end: Point; clickMode: boolean };

/** Draw right-angled wires by dragging, or click–click (EDT-09). */
export class WireTool implements Tool {
  readonly id = "wire" as const;
  private s: State = { kind: "idle" };

  get state(): State["kind"] {
    return this.s.kind;
  }

  cursor(): string {
    return "crosshair";
  }

  /** Snap to a terminal under the pointer, otherwise to the grid. */
  private point(e: CanvasPointer, ctx: ToolContext): Point {
    const t = ctx.hit(e).find((h) => h.target.kind === "terminal")?.target;
    return t?.kind === "terminal" ? t.at : ctx.view.snap(e);
  }

  onPointerDown(e: CanvasPointer, ctx: ToolContext): void {
    if (e.button !== 0) return;
    const p = this.point(e, ctx);
    if (this.s.kind === "drawing" && this.s.clickMode) {
      this.finish(p, ctx);
      return;
    }
    this.s = { kind: "drawing", start: p, end: p, clickMode: false };
  }

  onPointerMove(e: CanvasPointer, ctx: ToolContext): void {
    if (this.s.kind !== "drawing") return;
    this.s.end = this.point(e, ctx);
    ctx.invalidateOverlay();
  }

  onPointerUp(e: CanvasPointer, ctx: ToolContext): void {
    if (this.s.kind !== "drawing" || this.s.clickMode) return;
    const p = this.point(e, ctx);
    if (p.x === this.s.start.x && p.y === this.s.start.y) this.s.clickMode = true;
    else this.finish(p, ctx);
  }

  cancel(ctx: ToolContext): void {
    this.s = { kind: "idle" };
    ctx.invalidateOverlay();
  }

  private finish(end: Point, ctx: ToolContext): void {
    if (this.s.kind !== "drawing") return;
    const start = this.s.start;
    this.s = { kind: "idle" };
    ctx.invalidateOverlay();
    if (start.x === end.x && start.y === end.y) return;
    const id = ctx.newId("w");
    const tx = ctx.begin({ key: "edit.wire" });
    tx.update((d) => {
      d.wires[id] = { id, points: routeL(start, end) };
    });
    tx.commit();
  }

  drawOverlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
    if (this.s.kind !== "drawing") return;
    const pts = routeL(this.s.start, this.s.end).map((p) => ctx.view.toScreen(p));
    g.strokeStyle = "#1e88e5";
    g.lineWidth = 2;
    g.setLineDash([6, 4]);
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.stroke();
  }
}
