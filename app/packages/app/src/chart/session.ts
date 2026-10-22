// Chart session state and actions (rendering.md §5.2, history-and-analysis.md §3).
// Owns what outlives a chart canvas: mode, window, trigger, cursors, ghosts,
// scrubbing. Frame-rate values go straight to the renderer; the small UI
// store below changes only on user actions, so React can read it.

import type { Frame, TimeScales, WorkerMessage } from "@cs/worker";
import {
  defaultChartModel,
  fitSpan,
  panWindow,
  zoomWindow,
  type ChartMode,
  type ChartModel,
  type ChartRenderer,
  type TriggerSpec,
} from "@cs/render";
import { createStore } from "../store";
import { t } from "../messages";
import type { AppController } from "../controller";
import type { GhostEntry } from "./lanes";

export interface ChartUi {
  mode: ChartMode;
  span: number;
  live: boolean;
  trigger: TriggerSpec;
  /** Probe whose channel the trigger watches. */
  triggerProbe?: string;
  cursors: boolean;
  /** The student is looking at an earlier moment while paused (CHT-22). */
  scrubbing: boolean;
  historyMissing: boolean;
  ghosts: GhostEntry[];
  timeScales?: TimeScales;
  showMeasurements: boolean;
}

/** Model fields that persist across chart attach/detach. */
type Persisted = Pick<ChartModel, "mode" | "span" | "live" | "start" | "trigger" | "cursors">;

const EPS = 1e-12;

export class ChartSession {
  readonly ui = createStore<ChartUi>({
    mode: "roll",
    span: defaultChartModel().span,
    live: true,
    trigger: defaultChartModel().trigger,
    cursors: false,
    scrubbing: false,
    historyMissing: false,
    ghosts: [],
    showMeasurements: false,
  });
  private persisted: Persisted;
  private ghostSeq = 0;
  private latest = 0;
  private wantT: number | undefined;
  /** Playhead while scrubbing (also kept when no chart is attached). */
  private scrubT: number | undefined;
  private inflight = false;

  constructor(private c: AppController) {
    const m = defaultChartModel();
    this.persisted = { mode: m.mode, span: m.span, live: m.live, start: m.start, trigger: m.trigger };
  }

  private get chart(): ChartRenderer | undefined {
    return this.c.chart;
  }

  get ghosts(): readonly GhostEntry[] {
    return this.ui.get().ghosts;
  }

  get model(): ChartModel {
    return this.chart?.state ?? { ...defaultChartModel(), ...this.persisted, latest: this.latest, playhead: this.scrubT ?? this.latest };
  }

  /** Push the session's model into a newly attached renderer. */
  attach(chart: ChartRenderer): void {
    const running = this.c.store.get().runState === "running";
    chart.update({ ...this.persisted, latest: this.latest, playhead: running ? undefined : this.latest });
  }

  setModel(patch: Partial<ChartModel>): void {
    for (const k of ["mode", "span", "live", "start", "trigger", "cursors"] as const) {
      if (k in patch) (this.persisted as Record<string, unknown>)[k] = patch[k];
    }
    this.chart?.update(patch);
    const ui: Partial<ChartUi> = {};
    if (patch.mode !== undefined) ui.mode = patch.mode;
    if (patch.span !== undefined) ui.span = patch.span;
    if (patch.live !== undefined) ui.live = patch.live;
    if (patch.trigger !== undefined) ui.trigger = patch.trigger;
    if ("cursors" in patch) ui.cursors = !!patch.cursors;
    this.ui.set(ui);
  }

  // ------------------------------------------------------------ from the controller

  /** Per frame. Returns true while scrubbing: the schematic keeps the historical display. */
  onFrame(f: Frame): boolean {
    this.latest = f.t1;
    const running = f.runState === "running";
    if (running && this.ui.get().scrubbing) this.endScrub();
    const scrubbing = this.ui.get().scrubbing;
    this.chart?.update(scrubbing ? { latest: f.t1 } : { latest: f.t1, playhead: running ? undefined : f.t1 });
    return scrubbing;
  }

  onWorkerMessage(m: WorkerMessage): void {
    if (m.type === "timeScales") this.ui.set({ timeScales: m.timeScales });
  }

  reset(): void {
    this.latest = 0;
    this.wantT = undefined;
    this.scrubT = undefined;
    this.ui.set({ scrubbing: false, historyMissing: false });
    this.persisted.start = 0;
    this.persisted.live = true;
    this.ui.set({ live: true });
  }

  // ------------------------------------------------------------ mode, window, trigger

  setMode(mode: ChartMode): void {
    if (mode === "triggered" && !this.ui.get().triggerProbe) {
      const first = Object.values(this.c.edits.doc.probes)[0];
      if (first) this.setTrigger({}, first.id);
    }
    this.setModel({ mode, live: true });
  }

  setSpan(span: number): void {
    if (span > 0) this.setModel({ span });
  }

  /** Zoom the time axis around `anchor` (seconds); factor < 1 zooms in. */
  zoom(factor: number, anchor?: number): void {
    const ch = this.chart;
    if (!ch) return this.setSpan(this.persisted.span * factor);
    const win = ch.visibleWindow();
    this.setModel(zoomWindow(ch.state, win, anchor ?? (win.t0 + win.t1) / 2, factor));
  }

  /** Pan by dt seconds. */
  pan(dt: number): void {
    const ch = this.chart;
    if (ch) this.setModel(panWindow(ch.visibleWindow(), dt));
  }

  goLive(): void {
    this.setModel({ live: true });
    this.chart?.rearmTrigger();
  }

  /** Fit the window to the circuit's natural time scale from the worker (timeScales). */
  fitToCircuit(): boolean {
    const span = fitSpan(this.ui.get().timeScales);
    if (span === undefined) return false;
    this.setModel({ span, live: true });
    return true;
  }

  setTrigger(patch: Partial<TriggerSpec>, probeId?: string): void {
    const pid = probeId ?? this.ui.get().triggerProbe;
    const trigger: TriggerSpec = { ...this.persisted.trigger, ...patch, channelId: pid ? this.c.channelId(pid) : undefined };
    if (probeId !== undefined) this.ui.set({ triggerProbe: probeId });
    this.setModel({ trigger });
  }

  // ------------------------------------------------------------ cursors

  toggleCursors(on = !this.ui.get().cursors): void {
    if (!on) return this.setModel({ cursors: undefined });
    const ch = this.chart;
    const win = ch?.visibleWindow() ?? { t0: 0, t1: this.persisted.span };
    const w = win.t1 - win.t0;
    this.setModel({ cursors: { a: win.t0 + w / 3, b: win.t0 + (2 * w) / 3 } });
  }

  setCursor(id: "a" | "b", t: number): void {
    const cur = this.model.cursors;
    if (cur) this.setModel({ cursors: { ...cur, [id]: t } });
  }

  // ------------------------------------------------------------ scrubbing (CHT-22, CHT-23)

  get canScrub(): boolean {
    return this.c.store.get().runState !== "running" && this.c.history.length > 0;
  }

  /** Move the playhead to t and show that moment on the schematic. */
  scrubTo(t: number): void {
    if (!this.canScrub) return;
    const range = this.c.history.timeRange();
    const latest = this.latest;
    const lo = range ? range.t0 : 0;
    const tt = Math.min(latest, Math.max(lo, t));
    if (tt >= latest - EPS) return this.endScrub();
    this.scrubT = tt;
    this.chart?.update({ playhead: tt });
    this.ui.set({ scrubbing: true });
    this.wantT = tt;
    if (!this.inflight) void this.pump();
  }

  /** Nudge the playhead by a fraction of the window (arrow keys). */
  nudge(fraction: number): void {
    const ph = this.scrubT ?? this.latest;
    this.scrubTo(ph + fraction * this.model.span);
  }

  private async pump(): Promise<void> {
    const sim = this.c.sim;
    if (!sim) return;
    while (this.wantT !== undefined) {
      const tt = this.wantT;
      this.wantT = undefined;
      this.inflight = true;
      const r = await sim.getStateAt(tt);
      this.inflight = false;
      if (!this.ui.get().scrubbing) return;
      if (this.wantT !== undefined) continue; // a newer position is waiting
      if (r) {
        this.c.schematic?.setDisplay(r.display);
        this.chart?.update({ note: undefined });
        this.ui.set({ historyMissing: false });
      } else {
        this.chart?.update({ note: t("chart.noHistory") });
        this.ui.set({ historyMissing: true });
      }
    }
  }

  /** Back to the latest moment (Run also does this). */
  endScrub(): void {
    this.wantT = undefined;
    this.scrubT = undefined;
    const was = this.ui.get().scrubbing;
    this.ui.set({ scrubbing: false, historyMissing: false });
    if (!was) return;
    const running = this.c.store.get().runState === "running";
    this.chart?.update({ note: undefined, playhead: running ? undefined : this.latest });
    const latest = this.c.bus.latest;
    if (latest) this.c.schematic?.setDisplay(latest.display);
  }

  /** Restart the simulation from the playhead, discarding later history. */
  restartHere(): void {
    const tt = this.scrubT;
    if (tt === undefined || !this.ui.get().scrubbing) return;
    this.scrubT = undefined;
    this.c.sim?.restartFrom(tt);
    this.c.history.truncateAfter(tt);
    this.latest = tt;
    this.wantT = undefined;
    this.ui.set({ scrubbing: false, historyMissing: false });
    this.chart?.update({ latest: tt, playhead: tt, note: undefined });
  }

  // ------------------------------------------------------------ ghosts (CHT-17)

  /** Keep every probe's current trace as a faded, labelled ghost. */
  keepTraces(): void {
    const h = this.c.history;
    if (h.length === 0) return;
    const run = ++this.ghostSeq;
    const added: GhostEntry[] = [];
    for (const p of Object.values(this.c.edits.doc.probes)) {
      const ch = this.c.channelId(p.id);
      if (!h.channels().includes(ch)) continue;
      const label = t({ key: "chart.ghostLabel", values: { name: p.name, n: run } });
      const id = h.keepGhost(ch, { key: "chart.ghostLabel", values: { name: p.name, n: run } });
      added.push({ id, probeId: p.id, label });
    }
    const alive = new Set(h.ghosts().map((g) => g.id));
    this.ui.set({ ghosts: [...this.ui.get().ghosts, ...added].filter((g) => alive.has(g.id)) });
    this.refreshLanes();
  }

  clearGhosts(): void {
    for (const g of this.ui.get().ghosts) this.c.history.dropGhost(g.id);
    this.ui.set({ ghosts: [] });
    this.refreshLanes();
  }

  refreshLanes(): void {
    this.chart?.setLanes(this.c.chartLanes());
  }
}
