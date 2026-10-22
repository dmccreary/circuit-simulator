// Loop tool (PRB-16): click a starting node and then successive nodes around
// a closed loop. Each step is labeled with its rise or drop, a running total
// follows the path, and closing the loop shows the sum, which is 0 V. The
// overlay is drawn from the live display state, so it stays live while running.

import type { Point, ProbeTarget } from "@cs/model";
import { drawTag } from "@cs/render";
import { nodeTarget } from "../probes/targets";
import type { CanvasPointer, KeyInput, Tool, ToolContext } from "../tools/types";
import { loopSteps, nodeOfTarget } from "./compute";
import { DROP, RISE, lawSum, signed } from "./format";

interface Stop {
  target: ProbeTarget;
  at: Point; // grid point clicked
}

export class LoopTool implements Tool {
  readonly id = "loop" as const;
  stops: Stop[] = [];
  closed = false;

  cursor(): string {
    return "crosshair";
  }

  onPointerMove(e: CanvasPointer, ctx: ToolContext): void {
    ctx.setHover(ctx.hit(e)[0]);
    ctx.invalidateOverlay();
  }

  onPointerDown(e: CanvasPointer, ctx: ToolContext): void {
    const hit = ctx.hit(e)[0];
    const cc = ctx.compiled?.();
    if (!hit || !cc) return;
    const at = ctx.view.toGrid(e);
    const target = nodeTarget(hit.target, at, {
      terminals: (id) => (ctx.doc.parts[id] ? ctx.terminals(ctx.doc.parts[id]) : []),
    });
    if (!target) return;
    const node = nodeOfTarget(cc, target);
    if (node === undefined) return;
    if (this.closed) {
      this.stops = [];
      this.closed = false;
    }
    const nodes = this.nodes(ctx);
    if (nodes.length && nodes[nodes.length - 1] === node) return; // same node twice in a row
    this.stops.push({ target, at: ctx.view.snap(e) });
    if (this.stops.length > 2 && nodes[0] === node) {
      this.stops[this.stops.length - 1].at = this.stops[0].at;
      this.closed = true;
    }
    ctx.invalidateOverlay();
  }

  onKey(e: KeyInput, ctx: ToolContext): boolean {
    if ((e.key === "Backspace" || e.key === "Delete") && this.stops.length) {
      this.stops.pop();
      this.closed = false;
      ctx.invalidateOverlay();
      return true;
    }
    if (e.key === "Escape" && this.stops.length) {
      this.cancel(ctx);
      return true;
    }
    return false;
  }

  cancel(ctx: ToolContext): void {
    this.stops = [];
    this.closed = false;
    ctx.invalidateOverlay();
  }

  nodes(ctx: ToolContext): number[] {
    const cc = ctx.compiled?.();
    if (!cc) return [];
    return this.stops.map((s) => nodeOfTarget(cc, s.target) ?? -1);
  }

  drawOverlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
    const theme = ctx.theme?.();
    const cc = ctx.compiled?.();
    const display = ctx.display?.();
    if (!theme || !cc || this.stops.length === 0) return;
    const pts = this.stops.map((s) => ctx.view.toScreen(s.at));
    g.strokeStyle = theme.preview;
    g.lineWidth = 3;
    g.globalAlpha = 0.5;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
    g.globalAlpha = 1;
    for (const p of pts) {
      g.fillStyle = theme.preview;
      g.beginPath();
      g.arc(p.x, p.y, 4, 0, Math.PI * 2);
      g.fill();
    }
    if (!display) return;
    const blind = ctx.blind?.() ?? false;
    const r = loopSteps({ compiled: cc, display }, this.nodes(ctx));
    r.steps.forEach((s, i) => {
      const a = pts[i];
      const b = pts[i + 1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const label = s.element ? (ctx.doc.parts[s.element]?.label ?? s.element) : "";
      const text = `${label}${label ? " " : ""}${blind ? "?" : signed(s.rise, "V")}`;
      drawTag(g, mid, text, s.rise >= 0 ? RISE : DROP, theme, { center: true });
      if (!blind && !(r.closed && i === r.steps.length - 1)) {
        drawTag(g, { x: b.x + 8, y: b.y - 14 }, `Σ ${signed(r.totals[i], "V")}`, theme.ui.muted, theme, { bold: false, size: 11 });
      }
    });
    if (r.closed) {
      const p = pts[0];
      const text = `KVL: Σ = ${blind ? "?" : lawSum(r.sum, r.steps.map((s) => s.rise), "V")}`;
      drawTag(g, { x: p.x + 10, y: p.y + 20 }, text, theme.ui.accent, theme, { size: 13 });
    }
  }
}
