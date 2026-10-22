import type { CircuitDocument, Point, ProbeTarget } from "@cs/model";
import { formatValue, type Unit } from "@cs/units";
import { drawArrow, drawLeadTip, drawTag, type HitTarget } from "@cs/render";
import { addProbe, type Quantity } from "../probes/add";
import { nodeTarget, pointOnSegment, targetFor, type TargetContext } from "../probes/targets";
import { probeValue } from "../probes/evaluate";
import { probeCursor } from "./probe-cursors";
import type { CanvasPointer, Tool, ToolContext } from "./types";

/** The voltage-probe target for a hit (kept for callers that place voltage probes directly). */
export function probeTargetFor(t: HitTarget, at: { x: number; y: number }): ProbeTarget | undefined {
  switch (t.kind) {
    case "terminal":
      return { kind: "terminal", part: t.part, terminal: t.terminal };
    case "part":
    case "control":
      return { kind: "across", part: t.part };
    case "segment":
      return pointOnSegment(t, at);
  }
}

/** Add a voltage probe and put it on the first voltage lane (creating one if needed). */
export function addVoltageProbe(draft: CircuitDocument, target: ProbeTarget, probeId: string, laneId: string): void {
  addProbe(draft, "voltage", target, probeId, laneId);
}

export const UNIT: Record<Quantity, Unit> = { voltage: "V", current: "A", power: "W", logic: "" };

export function formatReading(q: Quantity, v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return "–";
  if (q === "logic") return v >= 0.5 ? "1" : "0";
  return formatValue(v, UNIT[q], { digits: 3 });
}

const DRAG_PX = 6;

/**
 * Voltage, current and power probe tools (PRB-01): one click places a probe.
 * With the voltage tool, pressing on one node and dragging to another places
 * a differential probe, red lead first. Hovering previews the target and the
 * value it would read (PRB-04). Shift keeps the tool for another probe.
 */
export class ProbeTool implements Tool {
  readonly id: "probe-v" | "probe-i" | "probe-p";
  private hover: { target: ProbeTarget; quantity: Quantity; screen: Point } | undefined;
  private press: { at: Point; screen: Point; hit: HitTarget; lead?: ProbeTarget } | undefined;
  private drag: { from: Point; to: Point; b?: ProbeTarget } | undefined;

  constructor(readonly quantity: Quantity = "voltage") {
    this.id = quantity === "current" ? "probe-i" : quantity === "power" ? "probe-p" : "probe-v";
  }

  cursor(): string {
    return probeCursor(this.quantity);
  }

  private targets(ctx: ToolContext): TargetContext {
    return {
      terminals: (id) => {
        const p = ctx.doc.parts[id];
        return p ? ctx.terminals(p) : [];
      },
      compiled: ctx.compiled?.(),
      display: ctx.display?.(),
    };
  }

  onPointerMove(e: CanvasPointer, ctx: ToolContext): void {
    const hit = ctx.hit(e)[0];
    const at = ctx.view.toGrid(e);
    if (this.press && this.quantity === "voltage" && this.press.lead) {
      if (this.drag || Math.hypot(e.x - this.press.screen.x, e.y - this.press.screen.y) > DRAG_PX) {
        const b = hit ? nodeTarget(hit.target, at, this.targets(ctx)) : undefined;
        this.drag = { from: this.press.screen, to: { x: e.x, y: e.y }, b };
        ctx.setHover(hit);
        ctx.invalidateOverlay();
        return;
      }
    }
    ctx.setHover(hit);
    const pick = hit ? targetFor(this.quantity, hit.target, at, this.targets(ctx)) : undefined;
    this.hover = pick && { ...pick, screen: { x: e.x, y: e.y } };
    ctx.invalidateOverlay();
  }

  onPointerDown(e: CanvasPointer, ctx: ToolContext): void {
    const hit = ctx.hit(e)[0];
    if (!hit) return;
    const at = ctx.view.toGrid(e);
    const lead = hit.target.kind === "part" || hit.target.kind === "control" ? undefined : nodeTarget(hit.target, at, this.targets(ctx));
    this.press = { at, screen: { x: e.x, y: e.y }, hit: hit.target, lead };
  }

  onPointerUp(e: CanvasPointer, ctx: ToolContext): void {
    const press = this.press;
    const drag = this.drag;
    this.press = undefined;
    this.drag = undefined;
    if (!press) return;
    let pick: { quantity: Quantity; target: ProbeTarget } | undefined;
    if (drag && press.lead && drag.b && JSON.stringify(drag.b) !== JSON.stringify(press.lead)) {
      pick = { quantity: "voltage", target: { kind: "between", a: press.lead, b: drag.b } };
    } else if (!drag) {
      pick = targetFor(this.quantity, press.hit, press.at, this.targets(ctx));
    }
    if (!pick) return ctx.invalidateOverlay();
    const id = ctx.newId("pr");
    const laneId = ctx.newId("ln");
    const tx = ctx.begin({ key: "probe.add" });
    const chosen = pick;
    tx.update((d) => void addProbe(d, chosen.quantity, chosen.target, id, laneId));
    tx.commit();
    this.hover = undefined;
    ctx.setHover(undefined);
    if (!e.shiftKey) ctx.setTool({ id: "select" });
    ctx.invalidateOverlay();
  }

  cancel(ctx: ToolContext): void {
    this.press = undefined;
    this.drag = undefined;
    this.hover = undefined;
    ctx.invalidateOverlay();
  }

  drawOverlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
    const theme = ctx.theme?.();
    if (!theme) return;
    if (this.drag) {
      g.strokeStyle = theme.preview;
      g.setLineDash([4, 3]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(this.drag.from.x, this.drag.from.y);
      g.lineTo(this.drag.to.x, this.drag.to.y);
      g.stroke();
      g.setLineDash([]);
      drawLeadTip(g, this.drag.from, "#d32f2f");
      drawLeadTip(g, this.drag.to, "#202020");
      return;
    }
    const h = this.hover;
    if (!h) return;
    const cc = ctx.compiled?.();
    const display = ctx.display?.();
    const v = cc && display ? probeValue({ compiled: cc, display }, { id: "__preview", quantity: h.quantity, target: h.target }) : undefined;
    const text = ctx.blind?.() ? "?" : formatReading(h.quantity, v);
    const label = { voltage: "V", current: "I", power: "P", logic: "L" }[h.quantity];
    drawTag(g, { x: h.screen.x + 14, y: h.screen.y + 16 }, `${label} = ${text}`, theme.preview, theme);
    if (h.target.kind === "segment" && h.quantity === "current") {
      // Show which way positive will point (PRB-06).
      const p = h.screen;
      const dir = h.target.reversed ? -1 : 1;
      const hit = ctx.hit(p)[0]?.target;
      if (hit?.kind === "segment") {
        const a = ctx.view.toScreen(hit.from);
        const b = ctx.view.toScreen(hit.to);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = ((b.x - a.x) / len) * 14 * dir;
        const uy = ((b.y - a.y) / len) * 14 * dir;
        drawArrow(g, { x: p.x - ux, y: p.y - uy }, { x: p.x + ux, y: p.y + uy }, theme.preview, 2);
      }
    }
  }
}
