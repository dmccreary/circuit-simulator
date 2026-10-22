// State of the Analyses panel: which tab is open, the job running for each
// tab, and results cached until the circuit or the settings change. The DC
// and Frequency tabs recompute by themselves 100 ms after an edit (ANL-05,
// ANL-12); sweeps and spectra run when asked.

import { compile, type ChannelSpec, type CompiledCircuit, type Netlist, type Probe } from "@cs/model";
import type { AnalysisJob, AnalysisResult } from "@cs/engine";
import { getDescriptor } from "@cs/elements";
import { parseValue } from "@cs/units";
import type { AppController } from "../controller";
import { createStore, type Store } from "../store";
import { AnalysisService, createAnalysisWorker, type AnalysisPort, type JobHandle } from "./service";
import { analysesOf, settingsOf, type AnalysisTab, type RangeSettings } from "./settings";

export interface TabState {
  status: "idle" | "running" | "done" | "cancelled" | "error";
  progress: number;
  result?: AnalysisResult;
  /** The previous result, drawn as a ghost (ANL-12). */
  ghost?: AnalysisResult;
  error?: string;
  /** Cache key of `result`. */
  key?: string;
}

export interface AnalysisUi {
  open: boolean;
  tab: AnalysisTab;
  tabs: Record<AnalysisTab, TabState>;
}

const idle = (): TabState => ({ status: "idle", progress: 0 });
const AUTO_TABS: AnalysisTab[] = ["dc", "ac"];
const EDIT_DEBOUNCE_MS = 100;

export interface OutputChoice {
  probe: Probe;
  spec: ChannelSpec;
}

export interface PartChoice {
  id: string;
  label: string;
  type: string;
}

export class AnalysisSession {
  readonly ui: Store<AnalysisUi>;
  readonly service: AnalysisService;
  private running = new Map<AnalysisTab, JobHandle<AnalysisResult>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: () => void;

  constructor(
    private readonly c: AppController,
    createPort: () => AnalysisPort | undefined = createAnalysisWorker,
  ) {
    this.service = new AnalysisService(createPort);
    this.ui = createStore<AnalysisUi>({
      open: false,
      tab: analysesOf(c.edits.doc).tab ?? "dc",
      tabs: { dc: idle(), ac: idle(), dcSweep: idle(), paramSweep: idle(), spectrum: idle() },
    });
    this.unsubscribe = c.edits.onPatches(() => this.onEdit());
  }

  dispose(): void {
    this.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
    this.service.dispose();
  }

  // ------------------------------------------------------------ panel

  open(tab?: AnalysisTab): void {
    this.ui.set({ open: true, ...(tab ? { tab } : {}) });
    this.autoRun();
  }

  close(): void {
    this.ui.set({ open: false });
  }

  toggle(): void {
    if (this.ui.get().open) this.close();
    else this.open();
  }

  setTab(tab: AnalysisTab): void {
    this.ui.set({ tab });
    this.autoRun();
  }

  private patchTab(tab: AnalysisTab, patch: Partial<TabState>): void {
    this.ui.set((s) => ({ tabs: { ...s.tabs, [tab]: { ...s.tabs[tab], ...patch } } }));
  }

  // ------------------------------------------------------------ circuit access

  compiled(): CompiledCircuit | undefined {
    if (this.c.compiled) return this.c.compiled;
    try {
      return compile(this.c.edits.doc, this.c.resolver);
    } catch {
      return undefined;
    }
  }

  netlist(): Netlist | undefined {
    return this.compiled()?.netlist;
  }

  /** Probes with a resolved channel; AC outputs accept voltage and current probes only. */
  outputs(kinds: ChannelSpec["kind"][] = ["voltage", "current", "power"]): OutputChoice[] {
    const cc = this.compiled();
    if (!cc) return [];
    return Object.values(this.c.edits.doc.probes)
      .map((probe) => ({ probe, spec: cc.channels[probe.id] }))
      .filter((o): o is OutputChoice => !!o.spec && kinds.includes(o.spec.kind))
      .map((o) => ({ probe: o.probe, spec: { ...o.spec, id: o.probe.id } as ChannelSpec }));
  }

  /** Independent sources that can be the frequency-response input (ANL-08). */
  sources(): PartChoice[] {
    const doc = this.c.edits.doc;
    return (this.netlist()?.elements ?? [])
      .filter((el) => {
        const t = getDescriptor(el.type)?.traits;
        return !!(t?.voltageSource || t?.currentSource) && el.type !== "ammeter";
      })
      .map((el) => ({ id: el.id, label: doc.parts[el.id]?.label ?? el.id, type: el.type }));
  }

  defaultInput(): string | undefined {
    const s = this.sources();
    return (s.find((p) => p.type === "ac-source") ?? s[0])?.id;
  }

  /** Parts with numeric properties that a sweep can vary (ANL-17). */
  sweepableParts(): (PartChoice & { keys: string[] })[] {
    return Object.values(this.c.edits.doc.parts)
      .map((p) => ({
        id: p.id,
        label: p.label,
        type: p.type,
        keys: (getDescriptor(p.type)?.props ?? []).filter((s) => (s.kind ?? "number") === "number").map((s) => s.key),
      }))
      .filter((p) => p.keys.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // ------------------------------------------------------------ jobs

  /** The job for a tab from the current circuit and settings, or a reason it cannot run. */
  buildJob(tab: AnalysisTab): AnalysisJob | string {
    const netlist = this.netlist();
    if (!netlist) return "analysis.noCircuit";
    const doc = this.c.edits.doc;
    switch (tab) {
      case "dc":
        return { kind: "dc", netlist };
      case "ac": {
        const s = settingsOf(doc, "ac");
        const outputs = this.outputs(["voltage", "current"]).map((o) => o.spec);
        if (outputs.length === 0) return "analysis.needProbe";
        const input = s.input && this.sources().some((p) => p.id === s.input) ? s.input : this.defaultInput();
        if (!input) return "analysis.needSource";
        return { kind: "ac", netlist, input, outputs, freqs: { start: s.start, stop: s.stop, pointsPerDecade: s.pointsPerDecade, scale: s.scale, points: 400 } };
      }
      case "dcSweep": {
        const s = settingsOf(doc, "dcSweep");
        const outputs = this.outputs().map((o) => o.spec);
        if (outputs.length === 0) return "analysis.needProbe";
        if (!s.element || !s.key) return "analysis.needParam";
        const values = rangeValues(s);
        const outer = s.outerElement && s.outerKey && s.outerList ? parseList(s.outerList) : [];
        return {
          kind: "sweep",
          sweep: "dc",
          netlist,
          param: { element: s.element, key: s.key },
          values,
          outputs,
          ...(outer.length ? { outer: { param: { element: s.outerElement!, key: s.outerKey! }, values: outer } } : {}),
        };
      }
      case "paramSweep": {
        const s = settingsOf(doc, "paramSweep");
        const outputs = this.outputs().map((o) => o.spec);
        if (outputs.length === 0) return "analysis.needProbe";
        if (!s.element || !s.key) return "analysis.needParam";
        return { kind: "sweep", sweep: s.kind, netlist, param: { element: s.element, key: s.key }, values: rangeValues(s), outputs, duration: s.duration, measure: s.measure };
      }
      case "spectrum": {
        const s = settingsOf(doc, "spectrum");
        const probe = s.probe && doc.probes[s.probe] ? s.probe : Object.keys(doc.probes)[0];
        if (!probe) return "analysis.needProbe";
        const ch = this.c.channelId(probe);
        const win = this.spectrumWindow(s.source);
        let times: Float64Array;
        let values: Float64Array;
        try {
          const v = this.c.history.view(ch, win.t0, win.t1);
          times = v.times();
          values = v.values();
        } catch {
          return "analysis.needRun";
        }
        if (times.length < 4) return "analysis.needRun";
        return { kind: "spectrum", times: Array.from(times), values: Array.from(values), window: s.window };
      }
    }
  }

  private spectrumWindow(source: "visible" | "cursors" | "all"): { t0: number; t1: number } {
    const cur = this.c.chartSession.model.cursors;
    if (source === "cursors" && cur) return { t0: Math.min(cur.a, cur.b), t1: Math.max(cur.a, cur.b) };
    if (source === "visible" && this.c.chart) return this.c.chart.visibleWindow();
    return { t0: -Infinity, t1: Infinity };
  }

  /** Run a tab's analysis unless its cached result is still current (or `force`). */
  run(tab: AnalysisTab, force = false): void {
    const job = this.buildJob(tab);
    if (typeof job === "string") {
      this.cancel(tab);
      this.patchTab(tab, { status: "error", error: job, progress: 0 });
      return;
    }
    const key = job.kind === "spectrum" ? undefined : JSON.stringify(job);
    const st = this.ui.get().tabs[tab];
    if (!force && key && st.key === key && (st.status === "done" || st.status === "running")) return;
    this.cancel(tab);
    const h = this.service.submit(job);
    this.running.set(tab, h);
    this.patchTab(tab, { status: "running", progress: 0, error: undefined, key, ghost: st.result ?? st.ghost });
    h.onProgress((fraction, partial) => {
      if (this.running.get(tab) === h) this.patchTab(tab, { progress: fraction, ...(partial ? { result: partial } : {}) });
    });
    void h.result.then((o) => {
      if (this.running.get(tab) !== h) return;
      this.running.delete(tab);
      if (o.status === "done") this.patchTab(tab, { status: "done", progress: 1, result: o.result });
      else if (o.status === "cancelled") this.patchTab(tab, { status: "cancelled", key: undefined, ...(o.partial ? { result: o.partial } : {}) });
      else this.patchTab(tab, { status: "error", key: undefined, error: o.message });
    });
  }

  cancel(tab: AnalysisTab): void {
    const h = this.running.get(tab);
    if (h) h.cancel();
  }

  private autoRun(): void {
    const { open, tab } = this.ui.get();
    if (open && AUTO_TABS.includes(tab)) this.run(tab);
  }

  private onEdit(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.autoRun();
    }, EDIT_DEBOUNCE_MS);
  }
}

/** "1k, 2.2k, 4.7k" -> [1000, 2200, 4700]; unparsable entries are skipped. */
export function parseList(text: string): number[] {
  return text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseValue(s))
    .filter((v): v is number => v !== null && Number.isFinite(v));
}

export function rangeValues(s: RangeSettings): number[] {
  const list = s.list ? parseList(s.list) : [];
  if (list.length) return list;
  const n = Math.max(1, Math.min(10000, Math.round(s.steps)));
  if (n === 1) return [s.start];
  if (s.scale === "log" && s.start > 0 && s.stop > 0) {
    const r = Math.log(s.stop / s.start);
    return Array.from({ length: n }, (_, i) => s.start * Math.exp((r * i) / (n - 1)));
  }
  return Array.from({ length: n }, (_, i) => s.start + ((s.stop - s.start) * i) / (n - 1));
}

const sessions = new WeakMap<AppController, AnalysisSession>();

/** The controller's analysis session, created on first use. */
export function analysisOf(c: AppController): AnalysisSession {
  let s = sessions.get(c);
  if (!s) {
    s = new AnalysisSession(c);
    sessions.set(c, s);
  }
  return s;
}

/** For tests: install a session with an injected worker port. */
export function installAnalysisSession(c: AppController, createPort: () => AnalysisPort | undefined): AnalysisSession {
  sessions.get(c)?.dispose();
  const s = new AnalysisSession(c, createPort);
  sessions.set(c, s);
  return s;
}
