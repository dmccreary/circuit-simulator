import { AutoRange, chartWindow, niceTicks } from "./axis";
import type { RenderScheduler } from "./scheduler";
import { type Theme, lightTheme } from "./theme";

/** The part of the history store's TraceView the chart needs (history-and-analysis.md §2). */
export interface TraceSource {
  minMaxBuckets(t0: number, t1: number, buckets: number): { min: ArrayLike<number>; max: ArrayLike<number> };
}

export interface HistorySource {
  view(channelId: string, t0: number, t1: number): TraceSource | undefined;
}

export interface ChartTrace {
  channelId: string;
  name: string;
  color: string;
}

export interface ChartLane {
  id: string;
  unit: string;
  traces: ChartTrace[];
}

export interface ChartState {
  mode: "roll" | "sweep";
  span: number; // seconds (CHT-07)
  latest: number; // newest simulated time with data
  playhead?: number; // shown when paused (CHT-22)
}

export type Formatter = (value: number, unit: string) => string;

const GUTTER_LEFT = 56;
const AXIS_H = 22;

/** Custom canvas chart (rendering.md §5): stacked lanes sharing one time axis. */
export class ChartRenderer {
  private canvas: HTMLCanvasElement;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lanes: ChartLane[] = [];
  private ranges = new Map<string, AutoRange>();
  private unsub: () => void;
  state: ChartState = { mode: "roll", span: 5, latest: 0 };

  constructor(
    host: HTMLElement,
    private scheduler: RenderScheduler,
    private history: HistorySource,
    private format: Formatter,
    private theme: Theme = lightTheme,
  ) {
    this.canvas = document.createElement("canvas");
    Object.assign(this.canvas.style, { width: "100%", height: "100%", display: "block" });
    host.appendChild(this.canvas);
    this.unsub = scheduler.onDraw("chart", () => this.draw());
  }

  dispose(): void {
    this.unsub();
    this.canvas.remove();
  }

  resize(width: number, height: number, dpr = globalThis.devicePixelRatio || 1): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.scheduler.invalidate("chart");
  }

  setTheme(t: Theme): void {
    this.theme = t;
    this.scheduler.invalidate("chart");
  }

  setLanes(lanes: ChartLane[]): void {
    this.lanes = lanes;
    for (const id of [...this.ranges.keys()]) if (!lanes.some((l) => l.id === id)) this.ranges.delete(id);
    this.scheduler.invalidate("chart");
  }

  update(patch: Partial<ChartState>): void {
    this.state = { ...this.state, ...patch };
    this.scheduler.invalidate("chart");
  }

  /** After Reset: forget ranges and time. */
  clear(): void {
    this.ranges.clear();
    this.state = { ...this.state, latest: 0, playhead: undefined };
    this.scheduler.invalidate("chart");
  }

  /** Simulated time at a CSS x position (for playhead dragging). */
  timeAt(x: number): number {
    const { t0, t1 } = chartWindow(this.state.mode, this.state.latest, this.state.span);
    const w = this.width - GUTTER_LEFT;
    return t0 + ((x - GUTTER_LEFT) / Math.max(1, w)) * (t1 - t0);
  }

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const th = this.theme;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = th.chart.background;
    ctx.fillRect(0, 0, this.width, this.height);
    const plotW = Math.max(1, Math.floor(this.width - GUTTER_LEFT - 8));
    const { t0, t1 } = chartWindow(this.state.mode, this.state.latest, this.state.span);
    const xOf = (t: number) => GUTTER_LEFT + ((t - t0) / (t1 - t0)) * plotW;
    ctx.font = `11px ${th.font}`;

    const lanes = this.lanes;
    const laneH = lanes.length ? (this.height - AXIS_H) / lanes.length : 0;
    const now = performance.now() / 1000;
    lanes.forEach((lane, li) => {
      const top = li * laneH + 6;
      const h = laneH - 12;
      const series = lane.traces.map((tr) => ({ tr, mm: this.history.view(tr.channelId, t0, t1)?.minMaxBuckets(t0, t1, plotW) }));
      // Only columns at or before the newest sample count.
      const lastCol = Math.min(plotW, Math.ceil(((this.state.latest - t0) / (t1 - t0)) * plotW));
      let lo = Infinity;
      let hi = -Infinity;
      for (const { mm } of series) {
        if (!mm) continue;
        for (let i = 0; i < lastCol; i++) {
          if (mm.min[i] < lo) lo = mm.min[i];
          if (mm.max[i] > hi) hi = mm.max[i];
        }
      }
      let ar = this.ranges.get(lane.id);
      if (!ar) this.ranges.set(lane.id, (ar = new AutoRange()));
      const r = Number.isFinite(lo) ? ar.update(lo, hi, now) : (ar.range ?? { min: -1, max: 1 });
      const yOf = (v: number) => top + h - ((v - r.min) / (r.max - r.min)) * h;

      ctx.strokeStyle = th.chart.laneBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(GUTTER_LEFT + 0.5, top + 0.5, plotW, h);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const v of niceTicks(r.min, r.max, Math.max(2, Math.floor(h / 30))).ticks) {
        const y = Math.round(yOf(v)) + 0.5;
        ctx.strokeStyle = th.chart.gridline;
        ctx.beginPath();
        ctx.moveTo(GUTTER_LEFT, y);
        ctx.lineTo(GUTTER_LEFT + plotW, y);
        ctx.stroke();
        ctx.fillStyle = th.chart.text;
        ctx.fillText(this.format(v, lane.unit), GUTTER_LEFT - 4, y);
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(GUTTER_LEFT, top, plotW, h);
      ctx.clip();
      for (const { tr, mm } of series) {
        if (!mm) continue;
        ctx.strokeStyle = tr.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < lastCol; i++) {
          const a = mm.min[i];
          const b = mm.max[i];
          if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
          const x = GUTTER_LEFT + i + 0.5;
          if (!started) ctx.moveTo(x, yOf(a));
          else ctx.lineTo(x, yOf(a));
          ctx.lineTo(x, yOf(b));
          started = true;
        }
        ctx.stroke();
      }
      ctx.restore();

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      let lx = GUTTER_LEFT + 6;
      for (const { tr } of series) {
        ctx.fillStyle = tr.color;
        ctx.fillText(tr.name, lx, top + 4);
        lx += ctx.measureText(tr.name).width + 12;
      }
    });

    // Shared time axis.
    const axisY = this.height - AXIS_H + 0.5;
    ctx.strokeStyle = th.chart.axis;
    ctx.beginPath();
    ctx.moveTo(GUTTER_LEFT, axisY);
    ctx.lineTo(GUTTER_LEFT + plotW, axisY);
    ctx.stroke();
    ctx.fillStyle = th.chart.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const t of niceTicks(t0, t1, Math.max(2, Math.floor(plotW / 90))).ticks) {
      const x = xOf(t);
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + 4);
      ctx.stroke();
      ctx.fillText(this.format(t, "s"), x, axisY + 5);
    }

    const ph = this.state.playhead;
    if (ph !== undefined && ph >= t0 && ph <= t1) {
      const x = Math.round(xOf(ph)) + 0.5;
      ctx.strokeStyle = th.chart.playhead;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, axisY);
      ctx.stroke();
    }
  }
}
