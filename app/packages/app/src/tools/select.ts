import type { Point } from "@cs/model";
import type { CanvasPointer, Tool, ToolContext, TxLike } from "./types";

type State =
  | { kind: "idle" }
  | { kind: "pan"; last: Point }
  | { kind: "drag"; start: Point; ids: string[]; orig: Record<string, Point>; tx?: TxLike; moved: boolean };

const DOUBLE_MS = 350;

/** Select, move, pan, and operate controls (CTL-01). */
export class SelectTool implements Tool {
  readonly id = "select" as const;
  private s: State = { kind: "idle" };
  private lastClick: { part: string; time: number } | undefined;

  get state(): State["kind"] {
    return this.s.kind;
  }

  cursor(): string {
    return this.s.kind === "pan" ? "grabbing" : this.s.kind === "drag" ? "move" : "default";
  }

  onPointerDown(e: CanvasPointer, ctx: ToolContext): void {
    const top = ctx.hit(e)[0]?.target;
    if (e.button === 1 || !top) {
      if (!top && !e.shiftKey) ctx.select([]);
      this.s = { kind: "pan", last: { x: e.x, y: e.y } };
      return;
    }
    if (top.kind === "control") {
      this.toggle(top.part, ctx);
      return;
    }
    if (top.kind === "segment") {
      ctx.select(e.shiftKey ? [...ctx.selection(), top.wire] : [top.wire]);
      return;
    }
    const part = top.part;
    if (this.lastClick?.part === part && e.time - this.lastClick.time < DOUBLE_MS) {
      this.lastClick = undefined;
      if (this.toggle(part, ctx)) return;
    }
    this.lastClick = { part, time: e.time };
    let sel = ctx.selection();
    if (e.shiftKey) sel = sel.includes(part) ? sel.filter((x) => x !== part) : [...sel, part];
    else if (!sel.includes(part)) sel = [part];
    ctx.select(sel);
    const ids = sel.filter((id) => ctx.doc.parts[id]);
    const orig = Object.fromEntries(ids.map((id) => [id, { ...ctx.doc.parts[id].at }]));
    this.s = { kind: "drag", start: ctx.view.snap(e), ids, orig, moved: false };
  }

  onPointerMove(e: CanvasPointer, ctx: ToolContext): void {
    const s = this.s;
    if (s.kind === "pan") {
      ctx.view.panBy(e.x - s.last.x, e.y - s.last.y);
      s.last = { x: e.x, y: e.y };
      ctx.invalidateView();
      return;
    }
    if (s.kind === "drag") {
      const p = ctx.view.snap(e);
      const dx = p.x - s.start.x;
      const dy = p.y - s.start.y;
      if (!s.moved && dx === 0 && dy === 0) return;
      s.moved = true;
      s.tx ??= ctx.begin({ key: "edit.move" });
      s.tx.update((d) => {
        for (const id of s.ids) if (d.parts[id]) d.parts[id].at = { x: s.orig[id].x + dx, y: s.orig[id].y + dy };
      });
      return;
    }
    ctx.setHover(ctx.hit(e)[0]);
    ctx.invalidateOverlay();
  }

  onPointerUp(_e: CanvasPointer, _ctx: ToolContext): void {
    if (this.s.kind === "drag") this.s.tx?.commit();
    this.s = { kind: "idle" };
  }

  cancel(): void {
    if (this.s.kind === "drag") this.s.tx?.cancel();
    this.s = { kind: "idle" };
  }

  /** Flip a switch-like part's boolean prop. Returns false if the part has none. */
  private toggle(partId: string, ctx: ToolContext): boolean {
    const part = ctx.doc.parts[partId];
    const key = part && ctx.descriptor(part.type)?.traits?.shortWhenProp;
    if (!key) return false;
    const tx = ctx.begin({ key: "edit.toggle" });
    tx.update((d) => {
      d.parts[partId].props[key] = !d.parts[partId].props[key];
    });
    tx.commit();
    return true;
  }
}
