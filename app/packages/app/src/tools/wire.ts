import type { Point } from "@cs/model";
import type { CanvasPointer, KeyInput, Tool, ToolContext } from "./types";
import { routeL } from "./route";

type State = { kind: "idle" } | { kind: "drawing"; start: Point; end: Point; clickMode: boolean; keyboard?: boolean };

/** Callbacks for keyboard wiring, so the shell can announce progress (ACC-04). */
export interface KeyboardWireHooks {
  moved?(end: Point): void;
  done?(connected: boolean): void;
}

const ARROWS: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };

/** Terminals and wire vertices a keyboard wire can jump to. */
export function wireTargets(ctx: Pick<ToolContext, "doc" | "terminals">): Point[] {
  const out: Point[] = [];
  const seen = new Set<string>();
  const add = (p: Point) => {
    const k = `${p.x},${p.y}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  };
  for (const p of Object.values(ctx.doc.parts)) ctx.terminals(p).forEach(add);
  for (const w of Object.values(ctx.doc.wires)) w.points.forEach(add);
  return out;
}

/** The nearest candidate within 60° of the direction, or undefined. */
export function jumpTarget(from: Point, dir: Point, candidates: Point[]): Point | undefined {
  let best: { p: Point; score: number } | undefined;
  for (const p of candidates) {
    const vx = p.x - from.x;
    const vy = p.y - from.y;
    const len = Math.hypot(vx, vy);
    if (len === 0) continue;
    const cos = (vx * dir.x + vy * dir.y) / len;
    if (cos < 0.5) continue;
    const score = len * (2 - cos);
    if (!best || score < best.score) best = { p, score };
  }
  return best?.p;
}

/** Draw right-angled wires by dragging, or click–click (EDT-09), or from the keyboard (ACC-04). */
export class WireTool implements Tool {
  readonly id = "wire" as const;
  private s: State = { kind: "idle" };
  private hooks: KeyboardWireHooks = {};

  get state(): State["kind"] {
    return this.s.kind;
  }

  /** Current end point while drawing. */
  get end(): Point | undefined {
    return this.s.kind === "drawing" ? this.s.end : undefined;
  }

  cursor(): string {
    return "crosshair";
  }

  /** Snap to a terminal under the pointer, otherwise to the grid. */
  private point(e: CanvasPointer, ctx: ToolContext): Point {
    const t = ctx.hit(e).find((h) => h.target.kind === "terminal")?.target;
    return t?.kind === "terminal" ? t.at : ctx.view.snap(e);
  }

  /** Begin a wire at `from`; arrows then pick its end and Enter connects. */
  startKeyboard(from: Point, ctx: ToolContext, hooks: KeyboardWireHooks = {}): void {
    this.s = { kind: "drawing", start: from, end: from, clickMode: true, keyboard: true };
    this.hooks = hooks;
    ctx.invalidateOverlay();
  }

  onKey(e: KeyInput, ctx: ToolContext): boolean {
    const s = this.s;
    if (s.kind !== "drawing" || e.ctrlKey || e.metaKey || e.altKey) return false;
    const dir = ARROWS[e.key];
    if (dir) {
      // Shift+arrow walks one grid step; a plain arrow jumps to the next terminal or wire end.
      const jump = e.shiftKey ? undefined : jumpTarget(s.end, dir, wireTargets(ctx));
      s.end = jump ?? { x: s.end.x + dir.x, y: s.end.y + dir.y };
      ctx.invalidateOverlay();
      this.hooks.moved?.(s.end);
      return true;
    }
    if (e.key === "Enter") {
      const connected = s.end.x !== s.start.x || s.end.y !== s.start.y;
      this.finish(s.end, ctx);
      this.hooks.done?.(connected);
      return true;
    }
    return false;
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
    if (this.s.kind !== "drawing" || this.s.keyboard) return;
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
    const wasKeyboard = this.s.kind === "drawing" && this.s.keyboard;
    this.s = { kind: "idle" };
    ctx.invalidateOverlay();
    if (wasKeyboard) this.hooks.done?.(false);
    this.hooks = {};
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
    if (this.s.keyboard) {
      // Keyboard users need to see where the wire will end.
      const e = ctx.view.toScreen(this.s.end);
      g.setLineDash([]);
      g.beginPath();
      g.arc(e.x, e.y, 7, 0, Math.PI * 2);
      g.stroke();
    }
  }
}
