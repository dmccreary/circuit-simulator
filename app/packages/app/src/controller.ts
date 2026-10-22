import type { CircuitDocument, CompiledCircuit, PartResolver, Point } from "@cs/model";
import { classify, compile, createEditSystem, newId, normalize, paramChanges, type EditSystem } from "@cs/model";
import { createPartResolver, getDescriptor, localToDocument, terminalPositions } from "@cs/elements";
import { ensureTypes, getView } from "@cs/elements/views";
import { decodeFrame, type Frame, type WorkerMessage } from "@cs/worker";
import { createHistoryStore } from "@cs/history";
import { formatValue, type Unit } from "@cs/units";
import {
  ChartRenderer,
  RenderScheduler,
  SchematicRenderer,
  probeColor,
  themeFor,
  type Theme,
  type ThemeName,
  type ChartLane,
  type ElementAccess,
  type HistorySource,
} from "@cs/render";
import { createAppStore, type AppState, type AppStore, type ToolSpec } from "./app-state";
import { FrameBus } from "./frame-bus";
import "./diagnostic-messages";
import { CommandRegistry } from "./commands/registry";
import { isMacPlatform } from "./commands/keymap";
import { registerBuiltinCommands } from "./commands/builtin";
import { registerAnalysisCommands } from "./analysis/commands";
import { installFiles } from "./files/install";
import { installShellFeatures } from "./settings/install";
import { SimClient, type WorkerPort } from "./sim/sim-client";
import { ToolController } from "./tools/controller";
import { ChartSession } from "./chart/session";
import { buildChartLanes } from "./chart/lanes";
import type { ToolContext } from "./tools/types";

// ensureTypes: the renderer loads lazy part-group views itself (circuit-model.md §5.4).
export const elementAccess: ElementAccess = { getView, getDescriptor, terminalPositions, localToDocument, ensureTypes: (t) => ensureTypes(t) };

/** Format a number for the chart axis: "2.5 V", "100 ms". */
export function formatAxis(v: number, unit: string): string {
  try {
    return formatValue(v, unit as Unit, { digits: 3, trimZeros: true });
  } catch {
    return String(Number(v.toPrecision(3)));
  }
}

/**
 * Wires the stores, edit system, worker, frame bus, history and renderers
 * together. React components receive it through context and never own state
 * that a layout change could lose (app-shell.md §3.2).
 */
export class AppController {
  readonly resolver: PartResolver = createPartResolver();
  readonly edits: EditSystem;
  readonly store: AppStore;
  readonly bus = new FrameBus();
  readonly history = createHistoryStore();
  readonly scheduler = new RenderScheduler();
  readonly commands: CommandRegistry<AppController>;
  readonly tools: ToolController;
  schematic: SchematicRenderer | undefined;
  /** Feature modules (settings, keyboard focus, gestures) configure each new schematic here. */
  readonly schematicHooks = new Set<(r: SchematicRenderer, host: HTMLElement) => void>();
  chart: ChartRenderer | undefined;
  /** Chart mode, window, trigger, cursors, ghosts and scrubbing (rendering.md §5.2). */
  readonly chartSession: ChartSession = new ChartSession(this);
  sim: SimClient | undefined;
  /** A hidden change the compiler sees but the document does not (lesson faults, LES-07). */
  compileOverlay: ((doc: CircuitDocument) => CircuitDocument) | undefined;
  private lastT: number | undefined;
  private disposers: Array<() => void> = [];

  constructor(doc: CircuitDocument, opts: { dark?: boolean; worker?: WorkerPort } = {}) {
    this.store = createAppStore(opts.dark ?? false);
    this.edits = createEditSystem(doc, { normalize: (d) => normalize(d, this.resolver, { labelPrefix: (t) => getDescriptor(t)?.labelPrefix }) });
    this.commands = new CommandRegistry<AppController>(() => this as AppController, isMacPlatform());
    registerBuiltinCommands(this.commands);
    registerAnalysisCommands(this.commands);
    installFiles(this);
    this.tools = new ToolController(this.toolContext());
    installShellFeatures(this);

    this.disposers.push(
      this.edits.onPatches((batch) => {
        this.sim?.applyBatch(batch, this.edits.doc);
        this.store.set({ canUndo: this.edits.canUndo, canRedo: this.edits.canRedo });
        this.pruneSelection();
        this.refreshRenderers();
      }),
      this.bus.subscribe((f) => this.onFrame(f)),
      this.store.subscribe(() => this.onStoreChange()),
    );

    const port = opts.worker ?? this.startWorker();
    if (port) {
      this.sim = new SimClient(
        port,
        {
          compile: (d, prev) => compile(this.compileOverlay ? this.compileOverlay(d) : d, this.resolver, prev),
          classify,
          paramChanges,
          decodeFrame,
        },
        {
          compiled: (cc) => {
            this.compileDiagnostics = cc.diagnostics.map(({ fixes: _fixes, ...d }) => d);
            this.publishDiagnostics();
            this.refreshRenderers();
          },
          frame: (f) => this.bus.publish(f),
          message: (m) => this.onWorkerMessage(m),
          error: (msg) => this.store.set({ workerError: msg }),
        },
      );
      this.sim.load(this.edits.doc);
      this.sim.send({ type: "setSpeed", speed: this.store.get().speed });
    }
  }

  get compiled(): CompiledCircuit | undefined {
    return this.sim?.compiled;
  }

  private startWorker(): WorkerPort | undefined {
    try {
      return new Worker(new URL("../../worker/src/live-worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerPort;
    } catch (e) {
      this.store.set({ workerError: `Could not start the simulation worker: ${(e as Error).message}` });
      return undefined;
    }
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.schematic?.dispose();
    this.chart?.dispose();
    this.sim?.dispose();
    this.scheduler.dispose();
  }

  // ------------------------------------------------------------ renderers

  attachSchematic(host: HTMLElement): SchematicRenderer {
    const r = new SchematicRenderer(host, this.scheduler, elementAccess, this.theme());
    r.addOverlay((g) => this.tools.drawOverlay(g));
    r.coarsePointer = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    this.schematic = r;
    for (const h of this.schematicHooks) h(r, host);
    const v = this.edits.doc.view;
    r.view.zoom = v.zoom;
    r.view.center = v.center;
    this.refreshRenderers();
    return r;
  }

  attachChart(host: HTMLElement): ChartRenderer {
    const history: HistorySource = {
      view: (id, t0, t1) => {
        try {
          return this.history.view(id, t0, t1);
        } catch {
          return undefined; // no samples for this channel yet
        }
      },
    };
    this.chart = new ChartRenderer(host, this.scheduler, history, formatAxis, this.theme());
    this.chartSession.attach(this.chart);
    this.refreshRenderers();
    return this.chart;
  }

  detachRenderers(): void {
    this.schematic?.dispose();
    this.chart?.dispose();
    this.schematic = undefined;
    this.chart = undefined;
  }

  private refreshRenderers(): void {
    const doc = this.edits.doc;
    if (this.schematic) {
      this.schematic.selection = new Set(this.store.get().selection);
      this.schematic.setCircuit(doc, this.compiled);
    }
    this.chart?.setLanes(this.chartLanes());
  }

  chartLanes(): ChartLane[] {
    return buildChartLanes(this.edits.doc, (id) => this.channelId(id), this.theme(), this.chartSession.ghosts);
  }

  channelId(probeId: string): string {
    return this.compiled?.channels[probeId]?.id ?? probeId;
  }

  // ------------------------------------------------------------ frames

  private onFrame(f: Frame): void {
    this.history.append(f);
    const running = f.runState === "running";
    this.store.set({ runState: f.runState, slowerThanRequested: f.slowerThanRequested });
    const scrubbing = this.chartSession.onFrame(f);
    const s = this.schematic;
    if (s) {
      if (!running && this.lastT !== undefined && f.t1 !== this.lastT) {
        const speed = this.store.get().speed;
        s.animator.advanceSimulated(f.t1 - this.lastT, typeof speed === "number" ? speed : f.effectiveSpeed || 1);
      }
      s.setRunning(running);
      if (!scrubbing) s.setDisplay(f.display);
    }
    this.lastT = f.t1;
  }

  // Structural checks from the compiler and numerical ones from the engine, shown together.
  private compileDiagnostics: AppState["diagnostics"] = [];
  private engineDiagnostics: AppState["diagnostics"] = [];

  private publishDiagnostics(): void {
    this.store.set({ diagnostics: [...this.compileDiagnostics, ...this.engineDiagnostics] });
  }

  private onWorkerMessage(m: WorkerMessage): void {
    if (m.type === "diagnostics") {
      this.engineDiagnostics = m.diagnostics;
      this.publishDiagnostics();
    }
    this.chartSession.onWorkerMessage(m);
  }

  private onStoreChange(): void {
    const st = this.store.get();
    if (this.tools.tool.id !== st.tool.id || (st.tool.id === "place" && (this.tools.tool as { type?: string }).type !== st.tool.type)) {
      this.tools.setTool(st.tool);
    }
    if (this.schematic) {
      const sel = st.selection;
      if (sel.length !== this.schematic.selection.size || sel.some((id) => !this.schematic!.selection.has(id))) {
        this.schematic.selection = new Set(sel);
        this.scheduler.invalidate("symbols", "overlay");
      }
    }
  }

  private pruneSelection(): void {
    const d = this.edits.doc;
    const sel = this.store.get().selection;
    const kept = sel.filter((id) => d.parts[id] || d.wires[id] || d.probes[id]);
    if (kept.length !== sel.length) this.store.set({ selection: kept });
  }

  // ------------------------------------------------------------ actions

  run(): void {
    this.chartSession.endScrub();
    this.sim?.send({ type: "run" });
    this.store.set({ runState: "running" });
    this.schematic?.setRunning(true);
  }

  pause(): void {
    this.sim?.send({ type: "pause" });
    this.store.set({ runState: "paused" });
    this.schematic?.setRunning(false);
  }

  step(): void {
    this.sim?.send({ type: "step" });
  }

  reset(): void {
    this.sim?.send({ type: "reset" });
    this.history.clear();
    this.bus.clear();
    this.lastT = undefined;
    this.schematic?.animator.resetPhases();
    this.schematic?.setDisplay(undefined);
    this.chart?.clear();
    this.chartSession.reset();
    this.store.set({ runState: "paused" });
  }

  setSpeed(speed: number | "fit"): void {
    this.store.set({ speed });
    this.sim?.send({ type: "setSpeed", speed });
  }

  setTool(t: ToolSpec): void {
    this.store.set({ tool: t });
  }

  selectedParts(): string[] {
    const d = this.edits.doc;
    return this.store.get().selection.filter((id) => d.parts[id]);
  }

  fit(): void {
    const s = this.schematic;
    const box = s?.contentBox();
    if (!s || !box) return;
    s.view.fit(box);
    this.scheduler.invalidateAll();
  }

  setVisible(visible: boolean): void {
    this.scheduler.setVisible(visible);
    this.sim?.send({ type: "setVisibility", visible });
  }

  setDark(dark: boolean): void {
    this.setTheme(dark ? "dark" : "light");
  }

  /** Light, dark or high contrast (ACC-11/12); `dark` stays true for both dark grounds. */
  setTheme(name: ThemeName): void {
    this.store.set({ theme: name, dark: name !== "light" });
    this.schematic?.setTheme(this.theme());
    this.chart?.setTheme(this.theme());
    this.chart?.setLanes(this.chartLanes());
  }

  /** Learner settings may adjust the theme (voltage color scale, SET-01). */
  themeAdjust: ((t: Theme) => Theme) | undefined;

  theme(): Theme {
    const st = this.store.get();
    const base = themeFor(st.theme ?? st.dark);
    return this.themeAdjust ? this.themeAdjust(base) : base;
  }

  private toolContext(): ToolContext {
    const self = this;
    return {
      get doc() {
        return self.edits.doc;
      },
      begin: (label) => self.edits.begin(label),
      hit: (p: Point) => self.schematic?.hitTest(p) ?? [],
      get view() {
        return self.schematic!.view;
      },
      descriptor: getDescriptor,
      terminals: (part) => {
        const d = getDescriptor(part.type);
        return d ? terminalPositions(part, d) : [];
      },
      selection: () => self.store.get().selection,
      select: (ids) => self.store.set({ selection: ids }),
      setTool: (t) => self.setTool(t),
      setHover: (h) => {
        if (self.schematic) self.schematic.hover = h?.target;
      },
      invalidateView: () => self.scheduler.invalidateAll(),
      invalidateOverlay: () => self.scheduler.invalidate("overlay"),
      newId: (prefix) => newId(prefix),
    };
  }
}
