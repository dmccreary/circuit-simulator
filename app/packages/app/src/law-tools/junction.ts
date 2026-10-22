// Junction tool (PRB-18): click a node to see every current entering and
// leaving it as an arrow with a value, and their sum, which is 0 A. Live
// while running.

import type { Point, ProbeTarget } from "@cs/model";
import { drawArrow, drawTag } from "@cs/render";
import { nodeTarget } from "../probes/targets";
import type { CanvasPointer, KeyInput, Tool, ToolContext } from "../tools/types";
import { junctionCurrents, nodeOfTarget } from "./compute";
import { DROP, RISE, lawSum, signed } from "./format";

export class JunctionTool implements Tool {
  readonly id = "junction" as const;
  picked: { target: ProbeTarget; at: Point } | undefined;

  cursor(): string {
    return "crosshair";
  }

  onPointerMove(e: CanvasPointer, ctx: ToolContext): void {
    ctx.setHover(ctx.hit(e)[0]);
    ctx.invalidateOverlay();
  }

  onPointerDown(e: CanvasPointer, ctx: ToolContext): void {
    const hit = ctx.hit(e)[0];
    if (!hit) return;
    const target = nodeTarget(hit.target, ctx.view.toGrid(e), {
      terminals: (id) => (ctx.doc.parts[id] ? ctx.terminals(ctx.doc.parts[id]) : []),
    });
    if (!target) return;
    this.picked = { target, at: ctx.view.snap(e) };
    ctx.invalidateOverlay();
  }

  onKey(e: KeyInput, ctx: ToolContext): boolean {
    if (e.key === "Escape" && this.picked) {
      this.cancel(ctx);
      return true;
    }
    return false;
  }

  cancel(ctx: ToolContext): void {
    this.picked = undefined;
    ctx.invalidateOverlay();
  }

  drawOverlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
    const theme = ctx.theme?.();
    const cc = ctx.compiled?.();
    const display = ctx.display?.();
    if (!theme || !cc || !display || !this.picked) return;
    const node = nodeOfTarget(cc, this.picked.target);
    if (node === undefined) return;
    const blind = ctx.blind?.() ?? false;
    const r = junctionCurrents({ compiled: cc, display }, node);
    const v = ctx.view;
    for (const b of r.branches) {
      const part = ctx.doc.parts[b.element];
      if (!part) continue; // inside a subcircuit: counted in the sum, not drawn
      const terms = ctx.terminals(part);
      const tp = terms[b.terminal];
      if (!tp) continue;
      const cx = terms.reduce((s, p) => s + p.x, 0) / terms.length;
      const cy = terms.reduce((s, p) => s + p.y, 0) / terms.length;
      const ts = v.toScreen(tp);
      let dx = v.toScreen({ x: cx, y: cy }).x - ts.x;
      let dy = v.toScreen({ x: cx, y: cy }).y - ts.y;
      const len = Math.hypot(dx, dy) || 1;
      dx = (dx / len) * 22;
      dy = (dy / len) * 22;
      // Positive "leaving" flows from the node into the part.
      const out = b.leaving >= 0;
      const from = out ? { x: ts.x - dx * 0.2, y: ts.y - dy * 0.2 } : { x: ts.x + dx, y: ts.y + dy };
      const to = out ? { x: ts.x + dx, y: ts.y + dy } : { x: ts.x - dx * 0.2, y: ts.y - dy * 0.2 };
      const color = out ? DROP : RISE;
      drawArrow(g, from, to, color, 2.5, 8);
      const label = `${part.label} ${blind ? "?" : signed(out ? -Math.abs(b.leaving) : Math.abs(b.leaving), "A")}`;
      drawTag(g, { x: ts.x + dx * 1.2 + 4, y: ts.y + dy * 1.2 - 4 }, label, color, theme, { size: 11 });
    }
    const p = v.toScreen(this.picked.at);
    g.fillStyle = theme.ui.accent;
    g.beginPath();
    g.arc(p.x, p.y, 5, 0, Math.PI * 2);
    g.fill();
    const name = cc.netlist.nodeNames[node] ?? `N${node}`;
    const sum = blind ? "?" : lawSum(r.sum, r.branches.map((x) => x.leaving), "A");
    drawTag(g, { x: p.x + 10, y: p.y + 22 }, `${name} KCL: Σ in − out = ${sum}`, theme.ui.accent, theme, { size: 13 });
  }
}
