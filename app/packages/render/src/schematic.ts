import type { CircuitDocument, CompiledCircuit, Part, Point, Probe, ProbeTarget } from "@cs/model";
import { pointKey } from "@cs/model";
import type { Box, ElementDescriptor, ElementView } from "@cs/elements";
import { ViewTransform } from "./transform";
import { CanvasSymbolGraphics, RecordingGraphics, affineFrom, hasPath2D, type SymbolRecording } from "./canvas-graphics";
import { LiveLayerPlan } from "./live-plan";
import { HitIndex, hitTolerance, type HitResult, type HitTarget } from "./hit-index";
import { CurrentAnimator, buildDotPaths } from "./animator";
import { RenderScheduler, type Layer } from "./scheduler";
import { type Theme, lightTheme, voltageColor } from "./theme";
import { AutoRange } from "./axis";
import { formatValue } from "@cs/units";

/** What the renderer needs from the elements package (injected so tests stay DOM- and plug-in-free). */
export interface ElementAccess {
  getView(type: string): ElementView | undefined;
  getDescriptor(type: string): ElementDescriptor | undefined;
  terminalPositions(part: Part, d: ElementDescriptor): Point[];
  localToDocument(part: Part, p: Point): Point;
  /**
   * Load the views of part types not yet available (lazy part groups,
   * circuit-model.md §5.4). When given, the renderer requests missing views
   * itself and redraws once they arrive; meanwhile those parts show a placeholder.
   */
  ensureTypes?(types: string[]): Promise<void>;
}

/** Recorded symbols kept at most (cleared when exceeded; rebuilt on demand). */
const SYMBOL_CACHE_MAX = 4000;

export type OverlayDrawer = (ctx: CanvasRenderingContext2D, view: ViewTransform, theme: Theme) => void;

const CANVAS_LAYERS: Exclude<Layer, "chart">[] = ["grid", "symbols", "live", "dots", "overlay"];

export function probeColor(theme: Theme, token: string): string {
  const m = /^probe\.(\d+)$/.exec(token);
  if (m) return theme.probes[(Number(m[1]) - 1 + theme.probes.length) % theme.probes.length];
  return token;
}

/** Document-space bounding box of a part's hit shape. */
export function partBox(part: Part, view: ElementView | undefined, access: ElementAccess): Box {
  return localBoxToDocument(part, view?.hitShape(part) ?? { x: -0.5, y: -0.5, w: 1, h: 1 }, access);
}

export function localBoxToDocument(part: Part, local: Box, access: ElementAccess): Box {
  const corners = [
    { x: local.x, y: local.y },
    { x: local.x + local.w, y: local.y },
    { x: local.x, y: local.y + local.h },
    { x: local.x + local.w, y: local.y + local.h },
  ].map((p) => access.localToDocument(part, p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The schematic renderer (rendering.md §2): five stacked canvases redrawn
 * per layer by the shared scheduler, plus hit testing and the current animator.
 */
export class SchematicRenderer {
  readonly view = new ViewTransform();
  readonly animator = new CurrentAnimator();
  readonly hits = new HitIndex();
  private canvases = new Map<Layer, HTMLCanvasElement>();
  private doc: CircuitDocument | undefined;
  private compiled: CompiledCircuit | undefined;
  private display: Float64Array | undefined;
  private termCache = new Map<string, Point[]>();
  private vRange = new AutoRange();
  /** Symbols recorded as Path2D, by type, style, label, length and props (rendering.md §2.2). */
  private symbolCache = new Map<string, SymbolRecording>();
  /** Wires and terminals grouped by node, rebuilt with the circuit, drawn every frame. */
  private livePlan = new LiveLayerPlan();
  /** View types already requested from access.ensureTypes. */
  private requestedTypes = new Set<string>();
  private dpr = 1;
  private overlays = new Set<OverlayDrawer>();
  private unsubs: Array<() => void> = [];
  selection = new Set<string>();
  hover: HitTarget | undefined;
  coarsePointer = false;
  /** Learner setting (SET-01); views that draw only one style ignore it. */
  symbolStyle: "ansi" | "iec" | "lifelike" = "ansi";

  constructor(
    private host: HTMLElement,
    private scheduler: RenderScheduler,
    private access: ElementAccess,
    private theme: Theme = lightTheme,
  ) {
    host.style.position = host.style.position || "relative";
    for (const l of CANVAS_LAYERS) {
      const c = document.createElement("canvas");
      c.dataset.layer = l;
      Object.assign(c.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
      host.appendChild(c);
      this.canvases.set(l, c);
      this.unsubs.push(scheduler.onDraw(l, () => this.drawLayer(l)));
    }
    this.unsubs.push(scheduler.addTicker(this.animator.tick));
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    for (const c of this.canvases.values()) c.remove();
  }

  resize(width: number, height: number, dpr = globalThis.devicePixelRatio || 1): void {
    this.dpr = dpr;
    this.view.setViewport(width, height);
    for (const c of this.canvases.values()) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    this.scheduler.invalidateAll();
  }

  setTheme(t: Theme): void {
    this.theme = t;
    this.scheduler.invalidateAll();
  }

  /** Document or compilation changed: rebuild terminals, hit index, and dot paths. */
  setCircuit(doc: CircuitDocument, compiled?: CompiledCircuit): void {
    this.doc = doc;
    if (compiled) this.compiled = compiled;
    this.termCache.clear();
    for (const p of Object.values(doc.parts)) {
      const d = this.access.getDescriptor(p.type);
      this.termCache.set(p.id, d ? this.access.terminalPositions(p, d) : []);
    }
    this.rebuildHits();
    this.livePlan.build(doc, this.compiled, this.termCache, this.access.getView);
    this.requestMissingViews(doc);
    if (this.compiled) {
      this.animator.setPaths(
        buildDotPaths(this.compiled, { parts: doc.parts, getView: this.access.getView, localToDocument: this.access.localToDocument }),
      );
      this.animator.setDisplay(this.display);
    }
    this.scheduler.invalidate("symbols", "live", "dots", "overlay");
  }

  /** Ask for the views of lazily loaded part groups; redraw when they arrive. */
  private requestMissingViews(doc: CircuitDocument): void {
    if (!this.access.ensureTypes) return;
    const missing: string[] = [];
    for (const p of Object.values(doc.parts)) {
      if (this.requestedTypes.has(p.type) || this.access.getView(p.type) || !this.access.getDescriptor(p.type)) continue;
      this.requestedTypes.add(p.type);
      missing.push(p.type);
    }
    if (missing.length === 0) return;
    this.access.ensureTypes(missing).then(
      () => {
        if (this.doc) this.setCircuit(this.doc);
      },
      () => {
        for (const t of missing) this.requestedTypes.delete(t); // retry on the next change
      },
    );
  }

  /** Latest display state from a frame (node voltages, terminal currents). */
  setDisplay(display: Float64Array | undefined, now = performance.now() / 1000): void {
    this.display = display;
    this.animator.setDisplay(display);
    if (display && this.compiled) {
      let m = 0;
      for (let i = 1; i <= this.compiled.netlist.nodeCount; i++) m = Math.max(m, Math.abs(display[i] ?? 0));
      this.vRange.update(-m, m, now);
    }
    this.scheduler.invalidate("live", "dots", "overlay");
    this.scheduler.wake();
  }

  setRunning(running: boolean): void {
    this.animator.running = running;
    this.scheduler.wake();
  }

  addOverlay(d: OverlayDrawer): () => void {
    this.overlays.add(d);
    this.scheduler.invalidate("overlay");
    return () => {
      this.overlays.delete(d);
      this.scheduler.invalidate("overlay");
    };
  }

  /** Hit test at a screen point (CSS px relative to the host). */
  hitTest(screen: Point): HitResult[] {
    return this.hits.query(this.view.toGrid(screen), hitTolerance(this.view.scale, this.coarsePointer));
  }

  terminalsOf(partId: string): Point[] {
    return this.termCache.get(partId) ?? [];
  }

  nodeVoltage(node: number): number | undefined {
    return this.display?.[node];
  }

  /** Bounding box of everything in the document (for Fit). */
  contentBox(): Box | undefined {
    if (!this.doc) return undefined;
    const pts: Point[] = [];
    for (const w of Object.values(this.doc.wires)) pts.push(...w.points);
    for (const p of Object.values(this.doc.parts)) {
      const b = partBox(p, this.access.getView(p.type), this.access);
      pts.push({ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h });
    }
    if (!pts.length) return undefined;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  /** Document point a probe flag hangs from. */
  probeAnchor(t: ProbeTarget): Point | undefined {
    const doc = this.doc;
    if (!doc) return undefined;
    switch (t.kind) {
      case "terminal":
        return this.terminalsOf(t.part)[t.terminal];
      case "across":
      case "through": {
        const p = doc.parts[t.part];
        if (!p) return undefined;
        const b = partBox(p, this.access.getView(p.type), this.access);
        return { x: b.x + b.w, y: b.y };
      }
      case "point":
      case "segment": {
        const w = doc.wires[t.wire];
        const a = w?.points[t.segment];
        const b = w?.points[t.segment + 1];
        if (!a || !b) return undefined;
        const f = t.kind === "point" ? t.t : 0.5;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
      case "between":
        return this.probeAnchor(t.a);
    }
  }

  private rebuildHits(): void {
    const doc = this.doc;
    this.hits.clear();
    if (!doc) return;
    for (const p of Object.values(doc.parts)) {
      const view = this.access.getView(p.type);
      this.hits.insert({ kind: "part", part: p.id, box: partBox(p, view, this.access) });
      this.terminalsOf(p.id).forEach((at, terminal) => this.hits.insert({ kind: "terminal", part: p.id, terminal, at }));
      for (const c of view?.controls?.(p) ?? []) {
        this.hits.insert({ kind: "control", part: p.id, control: c.id, box: localBoxToDocument(p, c.shape, this.access) });
      }
    }
    for (const w of Object.values(doc.wires)) {
      for (let i = 0; i + 1 < w.points.length; i++) {
        this.hits.insert({ kind: "segment", wire: w.id, segment: i, from: w.points[i], to: w.points[i + 1] });
      }
    }
  }

  /** Props marked showOnCanvas, formatted with units ("10 kΩ"). */
  private canvasValues(part: Part): string[] {
    const d = this.access.getDescriptor(part.type);
    const out: string[] = [];
    for (const spec of d?.props ?? []) {
      const v = part.props[spec.key];
      if (spec.showOnCanvas && typeof v === "number") out.push(formatValue(v, spec.unit, { trimZeros: true }));
    }
    return out;
  }

  private ctxFor(l: Layer): CanvasRenderingContext2D | null {
    const c = this.canvases.get(l);
    const ctx = c?.getContext("2d") ?? null;
    if (!c || !ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return ctx;
  }

  private drawLayer(l: Layer): void {
    const ctx = this.ctxFor(l);
    if (!ctx) return;
    switch (l) {
      case "grid":
        return this.drawGrid(ctx);
      case "symbols":
        return this.drawSymbols(ctx);
      case "live":
        return this.drawLive(ctx);
      case "dots":
        return this.animator.draw(ctx, this.view, this.theme);
      case "overlay":
        return this.drawOverlay(ctx);
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    const v = this.view;
    ctx.fillStyle = this.theme.tokens.background;
    ctx.fillRect(0, 0, v.width, v.height);
    // Fade below 40% zoom (CAN-06); thin out so dots stay ≥ 8 px apart.
    const alpha = v.zoom >= 0.4 ? 1 : Math.max(0, (v.zoom - 0.1) / 0.3);
    if (alpha <= 0) return;
    let step = 1;
    while (step * v.scale < 8) step *= 2;
    const box = v.visibleBox();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.theme.grid;
    const r = Math.max(0.6, Math.min(1.2, v.scale / 20));
    for (let gx = Math.floor(box.x / step) * step; gx <= box.x + box.w; gx += step) {
      for (let gy = Math.floor(box.y / step) * step; gy <= box.y + box.h; gy += step) {
        const p = v.toScreen({ x: gx, y: gy });
        ctx.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
      }
    }
    ctx.globalAlpha = 1;
  }

  private partMatrix(part: Part) {
    return affineFrom((p) => this.view.toScreen(this.access.localToDocument(part, p)));
  }

  private drawSymbols(ctx: CanvasRenderingContext2D): void {
    const doc = this.doc;
    if (!doc) return;
    const g = new CanvasSymbolGraphics(ctx, this.theme, this.dpr);
    const cache = hasPath2D();
    for (const part of Object.values(doc.parts)) {
      const view = this.access.getView(part.type);
      g.setFrame(this.partMatrix(part));
      g.tint = this.selection.has(part.id) ? this.theme.tokens["symbol.selected"] : undefined;
      if (view && cache) g.drawRecording(this.symbolFor(view, part));
      else if (view) view.drawSymbol(g, part, this.symbolStyle);
      else drawPlaceholder(g, part.type);
      g.tint = undefined;
      g.setFrame([this.view.scale, 0, 0, this.view.scale, 0, 0]);
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Label and main value, upright, beside each part (CAN-08).
    if (this.view.scale >= 9) {
      const fs = Math.max(10, Math.min(16, 0.6 * this.view.scale));
      ctx.font = `${fs.toFixed(0)}px ${this.theme.font}`;
      for (const part of Object.values(doc.parts)) {
        const lines = [part.label, ...this.canvasValues(part)].filter(Boolean);
        if (!lines.length) continue;
        const b = partBox(part, this.access.getView(part.type), this.access);
        const wide = b.w >= b.h;
        const anchor = this.view.toScreen(wide ? { x: b.x + b.w / 2, y: b.y } : { x: b.x + b.w + 0.3, y: b.y + b.h / 2 });
        ctx.textAlign = wide ? "center" : "left";
        ctx.textBaseline = wide ? "bottom" : "middle";
        lines.forEach((text, i) => {
          ctx.fillStyle = i === 0 && part.label ? this.theme.tokens.label : this.theme.tokens.value;
          const dy = wide ? -(lines.length - 1 - i) * fs * 1.1 - 2 : (i - (lines.length - 1) / 2) * fs * 1.1;
          ctx.fillText(text, anchor.x, anchor.y + dy);
        });
      }
    }
    // Junction dots where three or more connections meet (CAN-09).
    const count = new Map<string, number>();
    const bump = (p: Point, n = 1) => void count.set(pointKey(p), (count.get(pointKey(p)) ?? 0) + n);
    for (const w of Object.values(doc.wires)) {
      // A bend inside a wire already joins two segments.
      w.points.forEach((p, i) => bump(p, i > 0 && i < w.points.length - 1 ? 2 : 1));
    }
    for (const ts of this.termCache.values()) ts.forEach((p) => bump(p));
    ctx.fillStyle = this.theme.junction;
    for (const [k, n] of count) {
      if (n < 3) continue;
      const [x, y] = k.split(",").map(Number);
      const p = this.view.toScreen({ x, y });
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.5, 0.2 * this.view.scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The part's symbol recorded as Path2D, from the cache when an identical part was drawn before. */
  private symbolFor(view: ElementView, part: Part): SymbolRecording {
    const key = `${part.type}|${this.symbolStyle}|${part.label}|${part.length ?? ""}|${JSON.stringify(part.props)}`;
    let rec = this.symbolCache.get(key);
    if (!rec) {
      const r = new RecordingGraphics();
      view.drawSymbol(r, part, this.symbolStyle);
      rec = { ops: r.ops };
      if (this.symbolCache.size >= SYMBOL_CACHE_MAX) this.symbolCache.clear();
      this.symbolCache.set(key, rec);
    }
    return rec;
  }

  /**
   * Redrawn every frame while running (rendering.md §2.2). The per-circuit
   * work (which node each wire and terminal is on) is done in setCircuit, and
   * everything on one node is drawn as one path: one stroke for its wires,
   * one fill for its terminal dots.
   */
  private drawLive(ctx: CanvasRenderingContext2D): void {
    if (!this.doc) return;
    const v = this.view;
    const plan = this.livePlan;
    const display = this.display;
    const range = this.vRange.range?.max ?? 1;
    const wireColor = this.theme.tokens.wire;
    const color = (node: number) => (node < 0 || !display ? wireColor : voltageColor(this.theme, display[node] ?? 0, range));
    const s = v.scale;
    const ox = v.offsetX;
    const oy = v.offsetY;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, 0.14 * s);
    for (const grp of plan.wires) {
      const c = grp.coords;
      ctx.strokeStyle = color(grp.node);
      ctx.beginPath();
      for (let i = 0; i < c.length; i += 4) {
        ctx.moveTo(c[i] * s + ox, c[i + 1] * s + oy);
        ctx.lineTo(c[i + 2] * s + ox, c[i + 3] * s + oy);
      }
      ctx.stroke();
    }
    if (display && plan.liveParts.length > 0) {
      const g = new CanvasSymbolGraphics(ctx, this.theme, this.dpr);
      for (const lp of plan.liveParts) {
        const tv = lp.live.terminalVoltages as number[];
        for (let i = 0; i < lp.nodes.length; i++) tv[i] = lp.nodes[i] < 0 ? 0 : (display[lp.nodes[i]] ?? 0);
        g.setFrame(this.partMatrix(lp.part));
        lp.view.drawLive!(g, lp.part, lp.live);
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    const r = Math.max(2, 0.16 * s);
    for (const grp of plan.terminals) {
      const c = grp.coords;
      ctx.fillStyle = color(grp.node);
      ctx.beginPath();
      for (let i = 0; i < c.length; i += 2) {
        const x = c[i] * s + ox;
        const y = c[i + 1] * s + oy;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    const doc = this.doc;
    if (!doc) return;
    const v = this.view;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = this.theme.selection;
    for (const id of this.selection) {
      const part = doc.parts[id];
      if (part) {
        const b = partBox(part, this.access.getView(part.type), this.access);
        const a = v.toScreen({ x: b.x, y: b.y });
        ctx.strokeRect(a.x - 4, a.y - 4, b.w * v.scale + 8, b.h * v.scale + 8);
      }
      const w = doc.wires[id];
      if (w) {
        ctx.beginPath();
        w.points.forEach((p, i) => {
          const s = v.toScreen(p);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    this.drawHover(ctx);
    for (const probe of Object.values(doc.probes)) this.drawProbeFlag(ctx, probe);
    for (const d of this.overlays) {
      ctx.save();
      d(ctx, v, this.theme);
      ctx.restore();
    }
  }

  private drawHover(ctx: CanvasRenderingContext2D): void {
    const h = this.hover;
    if (!h) return;
    const v = this.view;
    ctx.strokeStyle = this.theme.hover;
    ctx.lineWidth = 2;
    if (h.kind === "terminal") {
      const p = v.toScreen(h.at);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(5, 0.35 * v.scale), 0, Math.PI * 2);
      ctx.stroke();
    } else if (h.kind === "segment") {
      const a = v.toScreen(h.from);
      const b = v.toScreen(h.to);
      ctx.lineWidth = Math.max(4, 0.35 * v.scale);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      const a = v.toScreen({ x: h.box.x, y: h.box.y });
      ctx.strokeRect(a.x - 2, a.y - 2, h.box.w * v.scale + 4, h.box.h * v.scale + 4);
    }
  }

  private drawProbeFlag(ctx: CanvasRenderingContext2D, probe: Probe): void {
    const at = this.probeAnchor(probe.target);
    if (!at) return;
    const v = this.view;
    const p = v.toScreen(at);
    const q = v.toScreen({ x: at.x + probe.flag.offset.x, y: at.y + probe.flag.offset.y });
    const col = probeColor(this.theme, probe.style.color);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `600 12px ${this.theme.font}`;
    const w = ctx.measureText(probe.name).width + 10;
    ctx.fillRect(q.x, q.y - 9, w, 18);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(probe.name, q.x + 5, q.y);
  }
}

/** Box with the type name, for parts with no view (FIL-16 placeholders). */
function drawPlaceholder(g: CanvasSymbolGraphics, type: string): void {
  g.beginPath();
  g.moveTo(-0.5, -0.5);
  g.lineTo(0.5, -0.5);
  g.lineTo(0.5, 0.5);
  g.lineTo(-0.5, 0.5);
  g.closePath();
  g.stroke("symbol");
  g.text(type.slice(0, 3), 0, 0, { size: 0.4 });
}
