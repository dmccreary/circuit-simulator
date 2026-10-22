import type { Point } from "@cs/model";
import { getView } from "@cs/elements/views";
import { getDescriptor, localToDocument, terminalPositions } from "@cs/elements";
import type { SchematicRenderer, Theme, ViewTransform } from "@cs/render";
import type { AppController } from "../controller";
import { createStore, type Store } from "../store";
import { t } from "../messages";
import type { Announcer } from "./announcer";
import { describePart } from "./describe";
import {
  anchorOf,
  cycleTerminal,
  neighbor,
  sameTarget,
  stepPart,
  targetExists,
  targetPart,
  type Direction,
  type FocusGeometry,
  type FocusTarget,
} from "./focus";

export interface FocusState {
  focus?: FocusTarget;
  /** True while the schematic element has DOM focus; canvas keys only act then. */
  canvasFocused: boolean;
}

/**
 * The canvas focus cursor (app-shell.md §5.4): moves with Tab, Alt+arrows and
 * [ ], draws a ring on the overlay layer, and is spoken through the announcer.
 */
export class FocusSession {
  readonly store: Store<FocusState> = createStore<FocusState>({ canvasFocused: false });
  private hosts = new WeakSet<HTMLElement>();
  private host: HTMLElement | undefined;

  constructor(
    private c: AppController,
    private announcer: Announcer,
    private decimal: () => "." | "," = () => ".",
  ) {
    c.schematicHooks.add((r, host) => this.attach(r, host));
    c.edits.onPatches(() => {
      const f = this.store.get().focus;
      if (f && !targetExists(this.geometry(), f)) this.store.set({ focus: undefined });
    });
    // ACC-04: W on a focused terminal starts a keyboard wire.
    c.commands.onRun((id) => {
      if (id === "tool.wire") this.startWire();
    });
  }

  geometry(): FocusGeometry {
    return {
      doc: this.c.edits.doc,
      terminals: (p) => {
        const d = getDescriptor(p.type);
        return d ? terminalPositions(p, d) : [];
      },
    };
  }

  get focus(): FocusTarget | undefined {
    return this.store.get().focus;
  }

  setCanvasFocused(v: boolean): void {
    this.store.set({ canvasFocused: v });
  }

  set(target: FocusTarget | undefined, speak = true): void {
    if (sameTarget(target, this.focus)) return;
    this.store.set({ focus: target });
    this.redraw();
    if (target && speak) this.announcer.say("focus", this.describe(target));
  }

  focusPart(id: string): void {
    this.set({ kind: "part", id });
    this.host?.focus();
  }

  /** Tab / Shift+Tab. Returns false past either end so focus can leave the canvas. */
  step(delta: 1 | -1): boolean {
    const next = stepPart(this.geometry(), this.focus, delta);
    if (!next) return false;
    this.set(next);
    return true;
  }

  canStep(delta: 1 | -1): boolean {
    return !!stepPart(this.geometry(), this.focus, delta);
  }

  move(dir: Direction): void {
    const f = this.focus;
    const n = f && neighbor(this.geometry(), f, dir);
    if (n) this.set(n);
  }

  cycle(delta: 1 | -1): void {
    const n = cycleTerminal(this.geometry(), this.focus, delta);
    if (n) this.set(n);
  }

  /** Enter: select the focused item; a second Enter moves into the inspector (EDT-25). */
  inspect(): void {
    const f = this.focus;
    if (!f) return;
    const id = f.kind === "wire" ? f.id : targetPart(f)!;
    const sel = this.c.store.get().selection;
    if (sel.length === 1 && sel[0] === id) {
      const field = document.querySelector<HTMLElement>(".inspector input, .inspector select, .inspector [role=checkbox]");
      field?.focus();
      return;
    }
    this.c.store.set({ selection: [id] });
    this.announcer.say("focus", t({ key: "a11y.selected", values: { name: this.describe(f) } }));
  }

  describe(target: FocusTarget): string {
    const g = this.geometry();
    if (target.kind === "wire") {
      const w = g.doc.wires[target.id];
      const a = w?.points[0];
      const b = w?.points[w.points.length - 1];
      return a && b ? t({ key: "a11y.wire", values: { x1: a.x, y1: a.y, x2: b.x, y2: b.y } }) : "";
    }
    const part = g.doc.parts[targetPart(target)!];
    if (!part) return "";
    const text = describePart(
      {
        doc: g.doc,
        compiled: this.c.compiled,
        display: this.c.bus.latest?.display,
        getView,
        getDescriptor,
        terminals: g.terminals,
        decimal: this.decimal(),
      },
      part,
    ).text;
    if (target.kind === "part") return text;
    const name = getDescriptor(part.type)?.terminals[target.terminal]?.name ?? String(target.terminal + 1);
    return `${t({ key: "a11y.terminal", values: { n: name, part: part.label || part.type } })}`;
  }

  /** Describe a grid point for keyboard wiring: the terminal there, or its coordinates. */
  describePoint(p: Point): string {
    const g = this.geometry();
    for (const part of Object.values(g.doc.parts)) {
      const ts = g.terminals(part);
      const i = ts.findIndex((q) => q.x === p.x && q.y === p.y);
      if (i >= 0) return this.describe({ kind: "terminal", part: part.id, terminal: i });
    }
    return t({ key: "a11y.point", values: { x: p.x, y: p.y } });
  }

  private redraw(): void {
    if (this.c.schematic) this.c.scheduler.invalidate("overlay");
  }

  private startWire(): void {
    const f = this.focus;
    if (!this.store.get().canvasFocused || f?.kind !== "terminal") return;
    const from = anchorOf(this.geometry(), f);
    if (!from) return;
    this.announcer.say("wire", t({ key: "a11y.wireStart", values: { from: this.describe(f) } }));
    this.c.tools.startKeyboardWire(from, {
      moved: (p) => this.announcer.say("wire", t({ key: "a11y.wireAt", values: { at: this.describePoint(p) } })),
      done: (ok) => this.announcer.say("wire", t(ok ? "a11y.wireDone" : "a11y.wireCancelled")),
    });
  }

  private attach(r: SchematicRenderer, host: HTMLElement): void {
    this.host = host;
    r.addOverlay((g, view, theme) => this.draw(g, view, theme));
    if (this.hosts.has(host)) return;
    this.hosts.add(host);
    host.addEventListener("focus", () => {
      this.setCanvasFocused(true);
      if (!this.focus) this.step(1);
      else this.announcer.say("focus", this.describe(this.focus));
      this.redraw();
    });
    host.addEventListener("blur", () => {
      this.setCanvasFocused(false);
      this.redraw();
    });
    // A click moves the focus cursor to what was clicked, so keyboard and mouse agree.
    host.addEventListener("pointerdown", (e) => {
      const rect = host.getBoundingClientRect();
      const hit = this.c.schematic?.hitTest({ x: e.clientX - rect.left, y: e.clientY - rect.top })[0]?.target;
      if (!hit) return;
      if (hit.kind === "segment") this.set({ kind: "wire", id: hit.wire }, false);
      else if (hit.kind === "terminal") this.set({ kind: "terminal", part: hit.part, terminal: hit.terminal }, false);
      else this.set({ kind: "part", id: hit.part }, false);
    });
  }

  /** Dashed ring in the focus color, distinct from the solid selection outline (ACC-03). */
  private draw(g: CanvasRenderingContext2D, view: ViewTransform, theme: Theme): void {
    const f = this.focus;
    if (!f || !this.store.get().canvasFocused) return;
    const geo = this.geometry();
    g.save();
    g.strokeStyle = theme.focus;
    g.lineWidth = 2;
    g.setLineDash([5, 3]);
    if (f.kind === "terminal") {
      const p = anchorOf(geo, f);
      if (p) {
        const s = view.toScreen(p);
        g.beginPath();
        g.arc(s.x, s.y, Math.max(7, view.scale * 0.45), 0, Math.PI * 2);
        g.stroke();
      }
    } else if (f.kind === "wire") {
      const w = geo.doc.wires[f.id];
      if (w) {
        g.lineWidth = 6;
        g.globalAlpha = 0.6;
        g.beginPath();
        w.points.forEach((p, i) => {
          const s = view.toScreen(p);
          if (i === 0) g.moveTo(s.x, s.y);
          else g.lineTo(s.x, s.y);
        });
        g.stroke();
      }
    } else {
      const part = geo.doc.parts[f.id];
      const box = part && partScreenBox(part, view);
      if (box) g.strokeRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8);
    }
    g.restore();
  }
}

function partScreenBox(part: import("@cs/model").Part, view: ViewTransform) {
  const v = getView(part.type);
  const d = getDescriptor(part.type);
  const local = v?.hitShape(part);
  const pts: Point[] = local
    ? [
        { x: local.x, y: local.y },
        { x: local.x + local.w, y: local.y },
        { x: local.x, y: local.y + local.h },
        { x: local.x + local.w, y: local.y + local.h },
      ].map((p) => localToDocument(part, p))
    : d
      ? terminalPositions(part, d)
      : [part.at];
  const s = pts.map((p) => view.toScreen(p));
  const xs = s.map((p) => p.x);
  const ys = s.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
