// Drawing one lane band: analog traces with one or two unit axes, ghosts,
// and logic waveforms (rendering.md §5.3, §5.6).

import { AutoRange, niceTicks, type Range } from "../axis";
import type { Theme } from "../theme";
import { logicColumn } from "./logic";
import type { ChartLane, ChartTrace, Formatter, TraceSource } from "./types";

export interface Series {
  tr: ChartTrace;
  src: TraceSource | undefined;
  mm: { min: ArrayLike<number>; max: ArrayLike<number> } | undefined;
}

export interface Plot {
  x: number; // left edge of the plot area
  w: number; // width in px (one bucket per px)
  t0: number;
  t1: number;
  /** Columns at or before the newest sample (live traces stop there). */
  lastCol: number;
}

export interface Band {
  top: number;
  h: number;
}

/** What hover and cursor drawing need to place values in a lane. */
export interface LaneGeometry {
  lane: ChartLane;
  band: Band;
  yOf: Map<string, (v: number) => number>;
}

const GHOST_ALPHA = 0.45;

export const unitOf = (lane: ChartLane, tr: ChartTrace) => tr.unit ?? lane.unit;

/** Units in a lane, primary (left axis) first. At most two get an axis. */
export function laneUnits(lane: ChartLane): string[] {
  const units: string[] = [];
  for (const tr of lane.traces) {
    const u = unitOf(lane, tr);
    if (!units.includes(u)) units.push(u);
  }
  if (units.includes(lane.unit)) {
    units.splice(units.indexOf(lane.unit), 1);
    units.unshift(lane.unit);
  }
  return units.length ? units : [lane.unit];
}

/** Data range of the series with this unit over the visible columns. */
function dataRange(series: Series[], unit: string, lane: ChartLane, plot: Plot): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const { tr, mm } of series) {
    if (!mm || unitOf(lane, tr) !== unit) continue;
    const n = tr.ghost ? plot.w : plot.lastCol;
    for (let i = 0; i < n; i++) {
      if (mm.min[i] < lo) lo = mm.min[i];
      if (mm.max[i] > hi) hi = mm.max[i];
    }
  }
  return { lo, hi };
}

export function drawAnalogLane(
  ctx: CanvasRenderingContext2D,
  th: Theme,
  format: Formatter,
  lane: ChartLane,
  band: Band,
  plot: Plot,
  series: Series[],
  ranges: (unit: string) => AutoRange,
  now: number,
): LaneGeometry {
  const { top, h } = band;
  const units = laneUnits(lane).slice(0, 2);
  const yOf = new Map<string, (v: number) => number>();
  const rangeFor = new Map<string, Range>();
  units.forEach((u, k) => {
    let r: Range;
    const fixed = lane.yScale?.mode === "fixed" && k === 0 ? lane.yScale : undefined;
    if (fixed && fixed.min !== undefined && fixed.max !== undefined && fixed.max > fixed.min) {
      r = { min: fixed.min, max: fixed.max };
    } else {
      const { lo, hi } = dataRange(series, u, lane, plot);
      const ar = ranges(u);
      r = Number.isFinite(lo) ? ar.update(lo, hi, now) : (ar.range ?? { min: -1, max: 1 });
    }
    rangeFor.set(u, r);
    yOf.set(u, (v: number) => top + h - ((v - r.min) / (r.max - r.min || 1)) * h);
  });

  ctx.strokeStyle = th.chart.laneBorder;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(plot.x + 0.5, top + 0.5, plot.w, h);
  const nTicks = Math.max(2, Math.floor(h / 30));
  units.forEach((u, k) => {
    const r = rangeFor.get(u)!;
    const y = yOf.get(u)!;
    ctx.textAlign = k === 0 ? "right" : "left";
    ctx.textBaseline = "middle";
    for (const v of niceTicks(r.min, r.max, nTicks).ticks) {
      const yy = Math.round(y(v)) + 0.5;
      if (k === 0) {
        ctx.strokeStyle = th.chart.gridline;
        ctx.beginPath();
        ctx.moveTo(plot.x, yy);
        ctx.lineTo(plot.x + plot.w, yy);
        ctx.stroke();
      }
      ctx.fillStyle = th.chart.text;
      ctx.fillText(format(v, u), k === 0 ? plot.x - 4 : plot.x + plot.w + 4, yy);
    }
  });

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, top, plot.w, h);
  ctx.clip();
  // Ghosts first so live traces draw over them.
  const ordered = [...series].sort((a, b) => Number(!!b.tr.ghost) - Number(!!a.tr.ghost));
  for (const s of ordered) {
    const y = yOf.get(unitOf(lane, s.tr)) ?? yOf.get(units[0])!;
    drawTrace(ctx, s, plot, y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  drawNames(ctx, series, plot, top);
  return { lane, band, yOf };
}

function drawTrace(ctx: CanvasRenderingContext2D, { tr, src, mm }: Series, plot: Plot, yOf: (v: number) => number): void {
  if (!mm) return;
  ctx.strokeStyle = tr.color;
  ctx.fillStyle = tr.color;
  ctx.lineWidth = tr.ghost ? 1.25 : 1.5;
  ctx.globalAlpha = tr.ghost ? GHOST_ALPHA : 1;
  ctx.setLineDash(tr.ghost ? [5, 3] : []);
  const n = tr.ghost ? plot.w : plot.lastCol;
  // Zoomed in far enough: draw the raw samples and mark each one (CHT-16).
  if (src?.times && src.values && src.length !== undefined && src.length > 0 && src.length < plot.w / 4) {
    const ts = src.times();
    const vs = src.values();
    const xOf = (t: number) => plot.x + ((t - plot.t0) / (plot.t1 - plot.t0)) * plot.w;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < ts.length; i++) {
      if (!Number.isFinite(vs[i])) {
        started = false;
        continue;
      }
      if (!started) ctx.moveTo(xOf(ts[i]), yOf(vs[i]));
      else ctx.lineTo(xOf(ts[i]), yOf(vs[i]));
      started = true;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < ts.length; i++) {
      if (!Number.isFinite(vs[i])) continue;
      ctx.beginPath();
      ctx.arc(xOf(ts[i]), yOf(vs[i]), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < n; i++) {
    const a = mm.min[i];
    const b = mm.max[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      started = false;
      continue;
    }
    const x = plot.x + i + 0.5;
    if (!started) ctx.moveTo(x, yOf(a));
    else ctx.lineTo(x, yOf(a));
    ctx.lineTo(x, yOf(b));
    started = true;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawNames(ctx: CanvasRenderingContext2D, series: Series[], plot: Plot, top: number): void {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let lx = plot.x + 6;
  for (const { tr } of series) {
    ctx.globalAlpha = tr.ghost ? 0.7 : 1;
    ctx.fillStyle = tr.color;
    const label = tr.ghost ? `◌ ${tr.name}` : tr.name;
    ctx.fillText(label, lx, top + 4);
    lx += ctx.measureText(label).width + 12;
  }
  ctx.globalAlpha = 1;
}

const X_FILL = "rgba(220, 50, 50, 0.35)";
const Z_COLOR = "#3c78d8";

/** Logic lane: one compact row per trace; X hatched red, Z at mid level in blue. */
export function drawLogicLane(
  ctx: CanvasRenderingContext2D,
  th: Theme,
  lane: ChartLane,
  band: Band,
  plot: Plot,
  series: Series[],
): LaneGeometry {
  const { top, h } = band;
  ctx.strokeStyle = th.chart.laneBorder;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(plot.x + 0.5, top + 0.5, plot.w, h);
  const rows = Math.max(1, series.length);
  const rowH = Math.min(32, (h - 4) / rows);
  const yOf = new Map<string, (v: number) => number>();
  series.forEach((s, r) => {
    const rt = top + 2 + r * rowH;
    const hiY = rt + 5;
    const loY = rt + rowH - 3;
    const midY = (hiY + loY) / 2;
    const yLevel = (v: number) => (v >= 1 ? hiY : v <= 0 ? loY : midY);
    if (r === 0) yOf.set(lane.unit, yLevel);
    ctx.fillStyle = th.chart.text;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(s.tr.name, plot.x - 4, midY);
    if (!s.mm) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, rt, plot.w, rowH);
    ctx.clip();
    ctx.globalAlpha = s.tr.ghost ? GHOST_ALPHA : 1;
    const n = s.tr.ghost ? plot.w : plot.lastCol;
    let prevY: number | undefined;
    let xStart = -1;
    let started = false;
    const flushX = (end: number) => {
      if (xStart < 0) return;
      hatch(ctx, plot.x + xStart, hiY, end - xStart, loY - hiY);
      xStart = -1;
    };
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const col = logicColumn(s.mm.min[i], s.mm.max[i]);
      const x = plot.x + i + 0.5;
      if (col.kind === "empty" && !started) continue;
      started = true;
      if (col.kind === "level" && col.level === "x") {
        if (xStart < 0) xStart = i;
        prevY = undefined;
        continue;
      }
      flushX(i);
      ctx.beginPath();
      if (col.kind === "edge") {
        ctx.strokeStyle = s.tr.color;
        ctx.moveTo(x, hiY);
        ctx.lineTo(x, loY);
        prevY = undefined;
      } else {
        // An empty column after the trace has started is high impedance (NaN = Z).
        const level = col.kind === "empty" ? "z" : col.level;
        const y = level === "z" ? midY : level === 1 ? hiY : loY;
        ctx.strokeStyle = level === "z" ? Z_COLOR : s.tr.color;
        ctx.moveTo(x - 0.5, prevY ?? y);
        ctx.lineTo(x - 0.5, y);
        ctx.lineTo(x + 0.5, y);
        prevY = y;
      }
      ctx.stroke();
    }
    flushX(n);
    ctx.restore();
  });
  ctx.globalAlpha = 1;
  return { lane, band, yOf };
}

function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = X_FILL;
  ctx.fillRect(x, y, w, h);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = "rgba(200, 40, 40, 0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = -h; k < w; k += 5) {
    ctx.moveTo(x + k, y + h);
    ctx.lineTo(x + k + h, y);
  }
  ctx.stroke();
  ctx.restore();
}
