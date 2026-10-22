import type { CircuitDocument, CompiledCircuit, PartResolver, Point } from "@cs/model";
import { classify, compile, createEditSystem, newId, normalize, paramChanges, type EditSystem } from "@cs/model";
import { createPartResolver, getDescriptor, localToDocument, terminalPositions } from "@cs/elements";
import { getView } from "@cs/elements/views";
import { decodeFrame, type Frame, type WorkerMessage } from "@cs/worker";
import { createHistoryStore } from "@cs/history";
import { formatValue, type Unit } from "@cs/units";
import {
  ChartRenderer,
  RenderScheduler,
  SchematicRenderer,
  probeColor,
  themeFor,
  type ChartLane,
  type ElementAccess,
  type HistorySource,
} from "@cs/render";
import { createAppStore, type AppStore, type ToolSpec } from "./app-state";
import { FrameBus } from "./frame-bus";
import { CommandRegistry } from "./commands/registry";
import { isMacPlatform } from "./commands/keymap";
import { registerBuiltinCommands } from "./commands/builtin";
import { SimClient, type WorkerPort } from "./sim/sim-client";
import { ToolController } from "./tools/controller";
import type { ToolContext } from "./tools/types";

export const elementAccess: ElementAccess = { getView, getDescriptor, terminalPositions, localToDocument };

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
  chart: ChartRenderer | undefined;
  sim: SimClient | undefined;
  private lastT: number | undefined;
  private disposers: Array<() => void> = [];

  constructor(doc: CircuitDocument, opts: { dark?: boolean; worker?: WorkerPort } = {}) {
    this.store = createAppStore(opts.dark ?? false);
    this.edits = createEditSystem(doc, { normalize: (d) => normalize(d, this.resolver, { labelPrefix: (t) => getDescriptor(t)?.labelPrefix }) });
    this.commands = new CommandRegistry<AppController>(() => this as AppController, isMacPlatform());
    registerBuiltinCommands(this.commands);
    this.tools = new ToolController(this.toolContext());

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
          compile: (d, prev) => compile(d, this.resolver, prev),
          classify,
          paramChanges,
          decodeFrame,
        },
        {
          compiled: () => this.refreshRenderers(),
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
    const r = new SchematicRenderer(host, this.scheduler, elementAccess, themeFor(this.store.get().dark));
    r.addOverlay((g) => this.tools.drawOverlay(g));
    r.coarsePointer = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    this.schematic = r;
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
    this.chart = new ChartRenderer(host, this.scheduler, history, formatAxis, themeFor(this.store.get().dark));
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
    const doc = this.edits.doc;
    const theme = themeFor(this.store.get().dark);
    return doc.lanes.map((lane) => ({
      id: lane.id,
      unit: "V",
      traces: Object.values(doc.probes)
        .filter((p) => p.lane === lane.id)
        .map((p) => ({ channelId: this.channelId(p.id), name: p.name, color: probeColor(theme, p.style.color) })),
    }));
  }

  channelId(probeId: string): string {
    return this.compiled?.channels[probeId]?.id ?? probeId;
  }

  // ------------------------------------------------------------ frames

  private onFrame(f: Frame): void {
    this.history.append(f);
    const running = f.runState === "running";
    this.store.set({ runState: f.runState, slowerThanRequested: f.slowerThanRequested });
    const s = this.schematic;
    if (s) {
      if (!running && this.lastT !== undefined && f.t1 !== this.lastT) {
        const speed = this.store.get().speed;
        s.animator.advanceSimulated(f.t1 - this.lastT, typeof speed === "number" ? speed : f.effectiveSpeed || 1);
      }
      s.setRunning(running);
      s.setDisplay(f.display);
    }
    this.lastT = f.t1;
    this.chart?.update({ latest: f.t1, playhead: running ? undefined : f.t1 });
  }

  private onWorkerMessage(m: WorkerMessage): void {
    if (m.type === "diagnostics") this.store.set({ diagnostics: m.diagnostics });
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
    this.store.set({ dark });
    this.schematic?.setTheme(themeFor(dark));
    this.chart?.setTheme(themeFor(dark));
    this.chart?.setLanes(this.chartLanes());
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
