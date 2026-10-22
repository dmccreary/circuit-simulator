import { AutoRange, minAutoSpan } from "./axis";
import type { RenderScheduler } from "./scheduler";
import { type Theme, lightTheme } from "./theme";
import { drawAnalogLane, drawLogicLane, type LaneGeometry, type Plot, type Series } from "./chart/draw-lanes";
import { drawMarkers, drawTimeAxis } from "./chart/draw-markers";
import { GUTTER_LEFT, GUTTER_RIGHT, GUTTER_RIGHT_AXIS, LANE_PAD, layoutLanes, type LaneLayout } from "./chart/layout";
import { liveWindow, type TimeWindow } from "./chart/time-window";
import { TriggerTracker, type TriggerResult } from "./chart/trigger";
import { laneUnits } from "./chart/draw-lanes";
import { defaultChartModel, type ChartLane, type ChartModel, type Formatter, type HistorySource } from "./chart/types";

export * from "./chart/types";
export * from "./chart/layout";
export * from "./chart/time-window";
export * from "./chart/trigger";
export * from "./chart/cursors";
export * from "./chart/logic";
export { laneUnits } from "./chart/draw-lanes";
export { cursorColor } from "./chart/draw-markers";

/**
 * Custom canvas chart (rendering.md §5): lanes stacked over one shared time
 * axis, each with its own vertical scale; roll, sweep and triggered windows;
 * cursors, hover readout, playhead and ghosts. Session state lives in
 * `state` (ChartModel); lanes come from the document.
 */
export class ChartRenderer {
  private canvas: HTMLCanvasElement;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lanes: ChartLane[] = [];
  private ranges = new Map<string, AutoRange>();
  private unsub: () => void;
  private tracker = new TriggerTracker();
  private lastTrigger: TriggerResult | undefined;
  private geometry: LaneGeometry[] = [];
  /** Preview heights while a divider is dragged (not yet in the document). */
  private previewHeights: number[] | undefined;
  state: ChartModel = defaultChartModel();

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

  get element(): HTMLCanvasElement {
    return this.canvas;
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
    this.previewHeights = undefined;
    for (const key of [...this.ranges.keys()]) if (!lanes.some((l) => key.startsWith(`${l.id}|`))) this.ranges.delete(key);
    this.scheduler.invalidate("chart");
  }

  getLanes(): readonly ChartLane[] {
    return this.lanes;
  }

  update(patch: Partial<ChartModel>): void {
    if (patch.trigger && patch.trigger !== this.state.trigger) this.tracker.rearm();
    if (patch.mode && patch.mode !== this.state.mode) this.tracker.rearm();
    this.state = { ...this.state, ...patch };
    this.scheduler.invalidate("chart");
  }

  /** After Reset: forget ranges, trigger state and time. */
  clear(): void {
    this.ranges.clear();
    this.tracker.reset();
    this.state = { ...this.state, latest: 0, playhead: undefined, start: 0, live: true, note: undefined };
    this.scheduler.invalidate("chart");
  }

  /** Re-arm a captured Single sweep. */
  rearmTrigger(): void {
    this.tracker.rearm();
    this.scheduler.invalidate("chart");
  }

  /** Forget auto-range history so lanes fit the data again (CHT-13 "Auto"). */
  resetRanges(laneId?: string): void {
    for (const key of [...this.ranges.keys()]) if (!laneId || key.startsWith(`${laneId}|`)) this.ranges.delete(key);
    this.scheduler.invalidate("chart");
  }

  /** The currently displayed auto range of a lane's primary unit. */
  laneRange(laneId: string): { min: number; max: number } | undefined {
    const lane = this.lanes.find((l) => l.id === laneId);
    return lane && this.ranges.get(`${laneId}|${laneUnits(lane)[0]}`)?.range;
  }

  previewLaneHeights(h: number[] | undefined): void {
    this.previewHeights = h;
    this.scheduler.invalidate("chart");
  }

  // ------------------------------------------------------------ geometry

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  layout(): LaneLayout {
    const heights = this.previewHeights ?? this.lanes.map((l) => l.height);
    return layoutLanes(heights, this.height);
  }

  plotArea(): { x: number; w: number } {
    const twoAxes = this.lanes.some((l) => l.kind !== "logic" && laneUnits(l).length > 1);
    const right = twoAxes ? GUTTER_RIGHT_AXIS : GUTTER_RIGHT;
    return { x: GUTTER_LEFT, w: Math.max(1, Math.floor(this.width - GUTTER_LEFT - right)) };
  }

  /** The visible time window (live roll/sweep, triggered, or panned). */
  visibleWindow(): TimeWindow {
    const m = this.state;
    if (!m.live) return { t0: m.start, t1: m.start + m.span };
    if (m.mode === "triggered") return this.triggerResult().window;
    return liveWindow(m.mode, m.latest, m.span);
  }

  /** Simulated time at a CSS x position. */
  timeAt(x: number): number {
    const { t0, t1 } = this.visibleWindow();
    const p = this.plotArea();
    return t0 + ((x - p.x) / p.w) * (t1 - t0);
  }

  xOf(t: number): number {
    const { t0, t1 } = this.visibleWindow();
    const p = this.plotArea();
    return p.x + ((t - t0) / (t1 - t0)) * p.w;
  }

  get triggerStatus(): TriggerResult["status"] | undefined {
    return this.state.mode === "triggered" ? this.lastTrigger?.status : undefined;
  }

  private triggerResult(): TriggerResult {
    const m = this.state;
    const ch = m.trigger.channelId;
    this.lastTrigger = this.tracker.update(m.trigger, m.latest, m.span, (t0, t1) => {
      const v = ch ? this.history.view(ch, t0, t1) : undefined;
      return v?.times && v.values ? { times: v.times(), values: v.values() } : undefined;
    });
    return this.lastTrigger;
  }

  private range(laneId: string, unit: string): AutoRange {
    const key = `${laneId}|${unit}`;
    let r = this.ranges.get(key);
    if (!r) this.ranges.set(key, (r = new AutoRange(minAutoSpan(unit))));
    return r;
  }

  // ------------------------------------------------------------ drawing

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const th = this.theme;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = th.chart.background;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.font = `11px ${th.font}`;

    const { t0, t1 } = this.visibleWindow();
    const area = this.plotArea();
    const lastCol = Math.max(0, Math.min(area.w, Math.ceil(((this.state.latest - t0) / (t1 - t0)) * area.w)));
    const plot: Plot = { x: area.x, w: area.w, t0, t1, lastCol };
    const layout = this.layout();
    const now = performance.now() / 1000;

    this.geometry = this.lanes.map((lane, li) => {
      const b = layout.bands[li];
      const band = { top: b.top + LANE_PAD, h: Math.max(4, b.height - 2 * LANE_PAD) };
      const series: Series[] = lane.traces.map((tr) => {
        const src = this.history.view(tr.channelId, t0, t1);
        return { tr, src, mm: src?.minMaxBuckets(t0, t1, area.w) };
      });
      return lane.kind === "logic"
        ? drawLogicLane(ctx, th, lane, band, plot, series)
        : drawAnalogLane(ctx, th, this.format, lane, band, plot, series, (u) => this.range(lane.id, u), now);
    });

    const axisY = layout.axisTop + 0.5;
    drawTimeAxis(ctx, th, this.format, plot, axisY);
    drawMarkers(ctx, {
      th,
      format: this.format,
      plot,
      axisY,
      model: this.state,
      lanes: this.geometry,
      history: this.history,
      trigger: this.state.mode === "triggered" && this.state.live ? this.lastTrigger : undefined,
    });
  }
}
