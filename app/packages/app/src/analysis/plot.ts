// A small canvas XY plot for analysis results: linear or log horizontal
// axis, 1-2-5 ticks from @cs/render, several series, vertical markers.

import { niceTicks, type Theme } from "@cs/render";

export interface PlotSeries {
  x: readonly number[];
  y: readonly number[];
  color: string;
  label?: string;
  dashed?: boolean;
  /** Draw as vertical bars from the bottom (spectrum lines). */
  bars?: boolean;
}

export interface PlotMarker {
  x: number;
  label: string;
  color?: string;
}

export interface PlotSpec {
  title?: string;
  xLog?: boolean;
  xFormat(v: number): string;
  yFormat(v: number): string;
  series: PlotSeries[];
  markers?: PlotMarker[];
  /** Fixed y range; auto from the data when absent. */
  yRange?: [number, number];
  xRange?: [number, number];
}

const PAD = { l: 64, r: 12, t: 20, b: 26 };

/** Ticks on a log axis: each decade, plus 2 and 5 when there are few decades. */
export function logTicks(min: number, max: number): number[] {
  const out: number[] = [];
  const d0 = Math.floor(Math.log10(min));
  const d1 = Math.ceil(Math.log10(max));
  const few = d1 - d0 <= 3;
  for (let d = d0; d <= d1; d++)
    for (const m of few ? [1, 2, 5] : [1]) {
      const v = m * Math.pow(10, d);
      if (v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)) out.push(v);
    }
  return out;
}

function minMax(v: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of v) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return [lo, hi];
}

function extent(values: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values)
    if (Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  if (!Number.isFinite(lo)) return [0, 1];
  if (hi - lo < 1e-12 * Math.max(1, Math.abs(hi))) return [lo - 1, hi + 1];
  const m = (hi - lo) * 0.05;
  return [lo - m, hi + m];
}

/** Draw the plot into a canvas sized by CSS; returns the x↔pixel mapping for hit testing. */
export function drawPlot(canvas: HTMLCanvasElement, spec: PlotSpec, theme: Theme): { toX(px: number): number } | undefined {
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 200;
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = theme.chart;
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, w, h);
  ctx.font = `11px ${theme.font}`;

  const xs = spec.series.flatMap((s) => s.x.filter((v) => !spec.xLog || v > 0) as number[]);
  let [x0, x1] = spec.xRange ?? (xs.length ? minMax(xs) : [spec.xLog ? 1 : 0, spec.xLog ? 10 : 1]);
  if (!(x1 > x0)) x1 = x0 + (spec.xLog ? x0 * 9 || 1 : 1);
  const [y0, y1] = spec.yRange ?? extent(spec.series.flatMap((s) => s.y as number[]));
  const pw = Math.max(10, w - PAD.l - PAD.r);
  const ph = Math.max(10, h - PAD.t - PAD.b);
  const lx = (v: number) => (spec.xLog ? Math.log10(v) : v);
  const px = (v: number) => PAD.l + ((lx(v) - lx(x0)) / (lx(x1) - lx(x0))) * pw;
  const py = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * ph;

  // grid and ticks
  ctx.strokeStyle = c.gridline;
  ctx.fillStyle = c.text;
  ctx.lineWidth = 1;
  const xt = spec.xLog ? logTicks(x0, x1) : niceTicks(x0, x1, Math.max(2, Math.floor(pw / 90))).ticks;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of xt) {
    const X = Math.round(px(t)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(X, PAD.t);
    ctx.lineTo(X, PAD.t + ph);
    ctx.stroke();
    ctx.fillText(spec.xFormat(t), X, PAD.t + ph + 4);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const t of niceTicks(y0, y1, Math.max(2, Math.floor(ph / 40))).ticks) {
    const Y = Math.round(py(t)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.l, Y);
    ctx.lineTo(PAD.l + pw, Y);
    ctx.stroke();
    ctx.fillText(spec.yFormat(t), PAD.l - 4, Y);
  }
  ctx.strokeStyle = c.axis;
  ctx.strokeRect(PAD.l + 0.5, PAD.t + 0.5, pw, ph);
  if (spec.title) {
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(spec.title, PAD.l + 4, 4);
  }

  // series
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD.l, PAD.t, pw, ph);
  ctx.clip();
  for (const s of spec.series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(s.dashed ? [4, 3] : []);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < s.x.length; i++) {
      const xv = s.x[i];
      const yv = s.y[i];
      if (!Number.isFinite(yv) || (spec.xLog && !(xv > 0))) {
        pen = false;
        continue;
      }
      const X = px(xv);
      const Y = py(yv);
      if (s.bars) {
        ctx.moveTo(X, PAD.t + ph);
        ctx.lineTo(X, Y);
      } else if (pen) ctx.lineTo(X, Y);
      else ctx.moveTo(X, Y);
      pen = true;
    }
    ctx.stroke();
  }
  ctx.setLineDash([3, 3]);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  (spec.markers ?? []).forEach((m, i) => {
    const X = Math.round(px(m.x)) + 0.5;
    ctx.strokeStyle = m.color ?? c.playhead;
    ctx.fillStyle = m.color ?? c.text;
    ctx.beginPath();
    ctx.moveTo(X, PAD.t);
    ctx.lineTo(X, PAD.t + ph);
    ctx.stroke();
    ctx.fillText(m.label, X + 3, PAD.t + 2 + (i % 4) * 13);
  });
  ctx.restore();

  return {
    toX(pxv: number) {
      const u = (pxv - PAD.l) / pw;
      const l = lx(x0) + u * (lx(x1) - lx(x0));
      return spec.xLog ? Math.pow(10, l) : l;
    },
  };
}
