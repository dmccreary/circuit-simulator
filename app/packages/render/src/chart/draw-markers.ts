// Shared time axis, playhead, cursors, hover readout and trigger marks.

import { niceTicks } from "../axis";
import type { Theme } from "../theme";
import { unitOf, type LaneGeometry, type Plot } from "./draw-lanes";
import type { ChartModel, Formatter, HistorySource } from "./types";

export const cursorColor = (th: Theme) => (th.name === "dark" ? "#ffb74d" : "#e65100");

export function drawTimeAxis(ctx: CanvasRenderingContext2D, th: Theme, format: Formatter, plot: Plot, axisY: number): void {
  const xOf = (t: number) => plot.x + ((t - plot.t0) / (plot.t1 - plot.t0)) * plot.w;
  ctx.strokeStyle = th.chart.axis;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(plot.x, axisY);
  ctx.lineTo(plot.x + plot.w, axisY);
  ctx.stroke();
  ctx.fillStyle = th.chart.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of niceTicks(plot.t0, plot.t1, Math.max(2, Math.floor(plot.w / 90))).ticks) {
    const x = xOf(t);
    ctx.beginPath();
    ctx.moveTo(x, axisY);
    ctx.lineTo(x, axisY + 4);
    ctx.stroke();
    ctx.fillText(format(t, "s"), x, axisY + 5);
  }
}

function vline(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
}

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg: string): void {
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = bg;
  ctx.fillRect(x - w / 2, y, w, 14);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y + 1);
}

export interface MarkerArgs {
  th: Theme;
  format: Formatter;
  plot: Plot;
  axisY: number;
  model: ChartModel;
  lanes: LaneGeometry[];
  history: HistorySource;
  trigger?: { at?: number; status: string };
}

export function drawMarkers(ctx: CanvasRenderingContext2D, a: MarkerArgs): void {
  const { th, plot, axisY, model } = a;
  const xOf = (t: number) => plot.x + ((t - plot.t0) / (plot.t1 - plot.t0)) * plot.w;
  const inside = (t: number | undefined): t is number => t !== undefined && t >= plot.t0 && t <= plot.t1;
  ctx.setLineDash([]);

  // Trigger: level line in the lane holding the trigger trace, time mark on the axis.
  if (model.mode === "triggered" && model.trigger.channelId) {
    const tg = model.trigger;
    for (const g of a.lanes) {
      const tr = g.lane.traces.find((x) => x.channelId === tg.channelId && !x.ghost);
      const y = tr && g.yOf.get(unitOf(g.lane, tr));
      if (!y) continue;
      const yy = Math.round(y(tg.level)) + 0.5;
      ctx.strokeStyle = tr!.color;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = tr!.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(tg.edge === "rising" ? "T↑" : "T↓", plot.x + plot.w - 22, yy - 7);
    }
    if (inside(a.trigger?.at)) {
      const x = xOf(a.trigger!.at!);
      ctx.fillStyle = th.chart.axis;
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x - 5, axisY - 7);
      ctx.lineTo(x + 5, axisY - 7);
      ctx.fill();
    }
    if (a.trigger && a.trigger.status !== "triggered") {
      ctx.fillStyle = th.chart.text;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      const label = { auto: "Auto (no trigger)", waiting: "Waiting for trigger", captured: "Single sweep captured" }[a.trigger.status];
      if (label) ctx.fillText(label, plot.x + plot.w - 4, axisY - 2);
    }
  }

  // Cursors A and B (CHT-26).
  const cc = cursorColor(th);
  if (model.cursors) {
    for (const [id, t] of [["A", model.cursors.a], ["B", model.cursors.b]] as const) {
      if (!inside(t)) continue;
      const x = Math.round(xOf(t)) + 0.5;
      ctx.strokeStyle = cc;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      vline(ctx, x, 0, axisY);
      ctx.setLineDash([]);
      tag(ctx, id, x, 0, cc, "#fff");
      for (const g of a.lanes) dotValues(ctx, a, g, t, x);
    }
  }

  // Playhead (CHT-22).
  const ph = model.playhead;
  if (inside(ph)) {
    const x = Math.round(xOf(ph)) + 0.5;
    ctx.strokeStyle = th.chart.playhead;
    ctx.lineWidth = 2;
    vline(ctx, x, 0, axisY);
    ctx.fillStyle = th.chart.playhead;
    ctx.beginPath();
    ctx.moveTo(x - 6, axisY);
    ctx.lineTo(x + 6, axisY);
    ctx.lineTo(x, axisY - 8);
    ctx.fill();
    if (model.note) {
      ctx.font = `11px ${th.font}`;
      const right = x + 8 + ctx.measureText(model.note).width < plot.x + plot.w;
      ctx.textAlign = right ? "left" : "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = th.chart.text;
      ctx.fillText(model.note, right ? x + 6 : x - 6, axisY - 10);
    }
  }

  // Hover readout (CHT-25): a line and each trace's value in the hovered lane.
  const hv = model.hover;
  if (hv && inside(hv.t)) {
    const x = Math.round(xOf(hv.t)) + 0.5;
    ctx.strokeStyle = th.chart.axis;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    vline(ctx, x, 0, axisY);
    ctx.globalAlpha = 1;
    const g = a.lanes.find((l) => l.lane.id === hv.lane);
    if (g) hoverBox(ctx, a, g, hv.t, x);
  }
}

function valueAt(a: MarkerArgs, channelId: string, t: number): number {
  const v = a.history.view(channelId, t, t);
  return v?.valueAt ? v.valueAt(t) : NaN;
}

function dotValues(ctx: CanvasRenderingContext2D, a: MarkerArgs, g: LaneGeometry, t: number, x: number): void {
  if (g.lane.kind === "logic") return;
  for (const tr of g.lane.traces) {
    const y = g.yOf.get(unitOf(g.lane, tr));
    const v = valueAt(a, tr.channelId, t);
    if (!y || !Number.isFinite(v)) continue;
    const yy = y(v);
    if (yy < g.band.top || yy > g.band.top + g.band.h) continue;
    ctx.fillStyle = tr.color;
    ctx.beginPath();
    ctx.arc(x, yy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hoverBox(ctx: CanvasRenderingContext2D, a: MarkerArgs, g: LaneGeometry, t: number, x: number): void {
  const lines: { text: string; color: string }[] = [{ text: a.format(t, "s"), color: a.th.chart.text }];
  for (const tr of g.lane.traces) {
    const v = valueAt(a, tr.channelId, t);
    const text = Number.isFinite(v) ? a.format(v, unitOf(g.lane, tr)) : "—";
    lines.push({ text: `${tr.name}: ${text}`, color: tr.color });
  }
  dotValues(ctx, a, g, t, x);
  const w = Math.max(...lines.map((l) => ctx.measureText(l.text).width)) + 12;
  const h = lines.length * 14 + 6;
  const bx = x + 10 + w > a.plot.x + a.plot.w ? x - 10 - w : x + 10;
  const by = Math.max(g.band.top + 2, Math.min(g.band.top + g.band.h - h - 2, g.band.top + 18));
  ctx.fillStyle = a.th.chart.background;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(bx, by, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = a.th.chart.laneBorder;
  ctx.strokeRect(bx + 0.5, by + 0.5, w, h);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => {
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, bx + 6, by + 4 + i * 14);
  });
}
