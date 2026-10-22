// The measurement session: everything a student uses to measure the circuit
// that is not a document change — hover cards and pinned meters (CAN-17,
// CAN-19), probe flags and their gestures (PRB-09/10), notices for removed
// probes (PRB-12), the multimeter (PRB-24), and the blind flag of lesson
// predictions. Session state only; never saved in the circuit file.

import type { CircuitDocument, Point, ProbeTarget } from "@cs/model";
import { inRect, type FlagHit, type SchematicRenderer, type Theme, type ViewTransform } from "@cs/render";
import type { AppController } from "../controller";
import { createStore, type Store } from "../store";
import type { CanvasInterceptor } from "../tools/controller";
import type { CanvasPointer, Tool } from "../tools/types";
import { addProbe, reverseProbe } from "./add";
import { buildFlags } from "./flags";
import { createDerivedTransform } from "./derived";
import { indexOf, segmentOf, type LiveSource } from "./evaluate";
import { nodeTarget, targetFor, targetOwners } from "./targets";
import { drawProbeFlags } from "@cs/render";

export type HoverInfo =
  | { kind: "part"; part: string; screen: Point }
  | { kind: "node"; target: ProbeTarget; seg?: { wire: string; segment: number }; screen: Point };

export type PinTarget = { kind: "part"; part: string } | { kind: "node"; target: ProbeTarget; at: Point; seg?: { wire: string; segment: number } };

export interface Pinned {
  id: string;
  target: PinTarget;
  /** Offset of the card from its anchor, screen px. */
  offset: Point;
}

export interface Notice {
  id: number;
  text: string;
  undo: boolean;
}

export type MeterMode = "dcv" | "acv" | "ohm" | "diode" | "continuity" | "amps";

export interface MeterState {
  mode: MeterMode;
  red?: { target: ProbeTarget; at: Point };
  black?: { target: ProbeTarget; at: Point };
}

export interface MeasureUi {
  hover?: HoverInfo;
  pinned: Pinned[];
  notices: Notice[];
  meter: MeterState | null;
  /** The HTML layer inside the schematic host, for the portal. */
  host?: HTMLElement;
}

const DOUBLE_MS = 350;
const NOTICE_MS = 8000;

export class MeasureSession {
  readonly ui: Store<MeasureUi> = createStore<MeasureUi>({ pinned: [], notices: [], meter: null });
  /** Flag boxes from the last overlay draw, for hit testing. */
  flagHits: FlagHit[] = [];
  /** Pinned cards' DOM elements, positioned on every overlay draw (they follow pan and zoom). */
  readonly pinnedEls = new Map<string, HTMLElement>();
  readonly leadEls = new Map<"red" | "black", HTMLElement>();
  private seq = 0;
  private lastFlagClick: { id: string; time: number } | undefined;
  private prevDoc: CircuitDocument;

  constructor(readonly c: AppController) {
    this.prevDoc = c.edits.doc;
    c.frameTransforms.push(createDerivedTransform(() => ({ doc: c.edits.doc, compiled: c.compiled })));
    c.tools.interceptors.push(this.interceptor());
    c.schematicHooks.add((r, host) => this.attach(r, host));
    c.edits.onPatches((b) => {
      if (b.source === "edit" && !b.provisional) this.noticeRemovedProbes(this.prevDoc, c.edits.doc);
      if (!b.provisional) this.prevDoc = c.edits.doc;
    });
    c.store.subscribe(() => this.redraw());
  }

  /** Redraw the overlay (only with a schematic attached: no canvas, no frames to request). */
  redraw(): void {
    if (this.c.schematic) this.c.scheduler.invalidate("overlay");
  }

  // ------------------------------------------------------------ live data

  /** Compiled circuit and the display state being drawn (live, or the scrub position, CAN-18). */
  live(): LiveSource | undefined {
    const compiled = this.c.compiled;
    const display = this.c.schematic?.displayState ?? this.c.bus.latest?.display;
    return compiled && display ? { compiled, display } : undefined;
  }

  blind(): boolean {
    return this.c.store.get().blind?.readouts ?? false;
  }

  // ------------------------------------------------------------ schematic

  private attach(r: SchematicRenderer, host: HTMLElement): void {
    r.builtinProbeFlags = false;
    r.addOverlay((g, view, theme) => this.drawOverlay(g, r, view, theme));
    // HTML layer (rendering.md §2.2, layer 6): cards, pinned meters, the multimeter.
    // Its events stay out of the canvas tools.
    const layer = document.createElement("div");
    layer.className = "measure-layer";
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "wheel", "dblclick"]) {
      layer.addEventListener(type, (e) => e.stopPropagation());
    }
    host.appendChild(layer);
    this.ui.set({ host: layer });
    const onMove = (e: PointerEvent) => this.trackHover(r, host, e);
    const onLeave = () => this.ui.set({ hover: undefined });
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
  }

  private trackHover(r: SchematicRenderer, host: HTMLElement, e: PointerEvent): void {
    const tool = this.c.store.get().tool.id;
    if (e.buttons !== 0 || !(tool === "select" || tool.startsWith("probe"))) {
      if (this.ui.get().hover) this.ui.set({ hover: undefined });
      return;
    }
    const rect = host.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = r.hitTest(screen)[0]?.target;
    let hover: HoverInfo | undefined;
    if (hit && (hit.kind === "part" || hit.kind === "control")) hover = { kind: "part", part: hit.part, screen };
    else if (hit) {
      const target = nodeTarget(hit, r.view.toGrid(screen), { terminals: (id) => r.terminalsOf(id) });
      if (target) hover = { kind: "node", target, seg: hit.kind === "segment" ? { wire: hit.wire, segment: hit.segment } : undefined, screen };
    }
    const prev = this.ui.get().hover;
    if (JSON.stringify(prev && { ...prev, screen: 0 }) === JSON.stringify(hover && { ...hover, screen: 0 })) return;
    this.ui.set({ hover });
    this.redraw();
  }

  /** The node a hover or pin target is on. */
  nodeOf(t: ProbeTarget): number | undefined {
    const cc = this.c.compiled;
    if (!cc) return undefined;
    if (t.kind === "terminal") return indexOf(cc).element.get(t.part)?.el.nodes[t.terminal];
    if (t.kind === "point" || t.kind === "segment") return segmentOf(cc, t.wire, t.segment)?.node;
    return undefined;
  }

  private drawOverlay(g: CanvasRenderingContext2D, r: SchematicRenderer, view: ViewTransform, theme: Theme): void {
    const hover = this.ui.get().hover;
    if (hover?.kind === "node") this.drawNodeHighlight(g, r, view, theme, this.nodeOf(hover.target));
    const doc = this.c.edits.doc;
    const flags = buildFlags({
      doc,
      renderer: r,
      theme,
      live: this.live(),
      selection: new Set(this.c.store.get().selection),
      blind: this.blind(),
    });
    this.flagHits = drawProbeFlags(g, flags, theme);
    this.positionFloating(r, view);
  }

  /** CAN-11: every wire and terminal on the hovered node. */
  private drawNodeHighlight(g: CanvasRenderingContext2D, r: SchematicRenderer, view: ViewTransform, theme: Theme, node: number | undefined): void {
    const cc = this.c.compiled;
    if (node === undefined || !cc) return;
    g.strokeStyle = theme.hover;
    g.fillStyle = theme.hover;
    g.globalAlpha = 0.45;
    g.lineCap = "round";
    g.lineWidth = Math.max(5, 0.4 * view.scale);
    g.beginPath();
    for (const s of cc.segments) {
      if (s.node !== node) continue;
      const a = view.toScreen(s.from);
      const b = view.toScreen(s.to);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    g.stroke();
    for (const el of cc.netlist.elements) {
      el.nodes.forEach((n, k) => {
        if (n !== node) return;
        const p = r.terminalsOf(el.id)[k];
        if (!p) return;
        const s = view.toScreen(p);
        g.beginPath();
        g.arc(s.x, s.y, Math.max(5, 0.3 * view.scale), 0, Math.PI * 2);
        g.fill();
      });
    }
    g.globalAlpha = 1;
  }

  /** Screen anchor of a pin target (pinned cards follow their part, CAN-19). */
  anchorOf(r: Pick<SchematicRenderer, "probeAnchor" | "view">, t: PinTarget): Point | undefined {
    const doc = t.kind === "part" ? r.probeAnchor({ kind: "across", part: t.part }) : t.at;
    return doc && r.view.toScreen(doc);
  }

  private positionFloating(r: SchematicRenderer, view: ViewTransform): void {
    for (const p of this.ui.get().pinned) {
      const el = this.pinnedEls.get(p.id);
      const a = this.anchorOf(r, p.target);
      if (!el) continue;
      if (!a) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "";
      el.style.transform = `translate(${Math.round(a.x + p.offset.x)}px, ${Math.round(a.y + p.offset.y)}px)`;
    }
    const meter = this.ui.get().meter;
    for (const which of ["red", "black"] as const) {
      const el = this.leadEls.get(which);
      const lead = meter?.[which];
      if (!el || !lead) continue;
      const s = view.toScreen(lead.at);
      el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
    }
  }

  // ------------------------------------------------------------ pinned meters

  pin(t: PinTarget, offset: Point = { x: 12, y: -12 }): void {
    const id = `pin${++this.seq}`;
    this.ui.set((s) => ({ pinned: [...s.pinned, { id, target: t, offset }], hover: undefined }));
    this.redraw();
  }

  unpin(id: string): void {
    this.pinnedEls.delete(id);
    this.ui.set((s) => ({ pinned: s.pinned.filter((p) => p.id !== id) }));
  }

  movePin(id: string, offset: Point): void {
    this.ui.set((s) => ({ pinned: s.pinned.map((p) => (p.id === id ? { ...p, offset } : p)) }));
    this.redraw();
  }

  // ------------------------------------------------------------ notices

  notify(text: string, undo = false): void {
    const id = ++this.seq;
    this.ui.set((s) => ({ notices: [...s.notices.slice(-2), { id, text, undo }] }));
    setTimeout(() => this.dismiss(id), NOTICE_MS);
  }

  dismiss(id: number): void {
    this.ui.set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
  }

  /** PRB-12: "Probe I2 removed with R3", with Undo. */
  noticeRemovedProbes(before: CircuitDocument, after: CircuitDocument): void {
    for (const p of Object.values(before.probes)) {
      if (after.probes[p.id]) continue;
      const own = targetOwners(p.target);
      const gonePart = own.parts.find((id) => !after.parts[id]);
      const goneWire = own.wires.find((id) => !after.wires[id]);
      if (!gonePart && !goneWire) continue;
      const what = gonePart ? (before.parts[gonePart]?.label ?? gonePart) : "its wire";
      this.notify(`Probe ${p.name} removed with ${what}`, true);
    }
  }

  // ------------------------------------------------------------ flag gestures

  /** Flag drag, select, double-click settings, arrow reverse (PRB-06/10/14), and Alt+click quick probes (PRB-02). */
  private interceptor(): CanvasInterceptor {
    let drag: { id: string; start: Point; orig: Point; tx?: ReturnType<AppController["edits"]["begin"]> } | undefined;
    return {
      down: (e: CanvasPointer, tool: Tool) => {
        if (e.button !== 0) return false;
        if (tool.id === "select" && e.altKey) return this.quickProbe(e);
        if (tool.id !== "select" && !tool.id.startsWith("probe")) return false;
        for (let i = this.flagHits.length - 1; i >= 0; i--) {
          const h = this.flagHits[i];
          if (h.arrow && inRect(h.arrow, e, 2) && this.c.edits.doc.probes[h.id]?.quantity === "current") {
            this.c.edits.edit({ key: "probe.reverse" }, (d) => void reverseProbe(d, h.id));
            return true;
          }
          if (!inRect(h.box, e, 2)) continue;
          const probe = this.c.edits.doc.probes[h.id];
          if (!probe) return false;
          this.c.store.set({ selection: [h.id] });
          const dbl = this.lastFlagClick?.id === h.id && e.time - this.lastFlagClick.time < DOUBLE_MS;
          this.lastFlagClick = { id: h.id, time: e.time };
          if (dbl) this.c.store.set({ tool: { id: "select" } });
          drag = { id: h.id, start: { x: e.x, y: e.y }, orig: { ...probe.flag.offset } };
          return true;
        }
        return false;
      },
      move: (e) => {
        const view = this.c.schematic?.view;
        if (!drag || !view) return;
        const dx = (e.x - drag.start.x) / view.scale;
        const dy = (e.y - drag.start.y) / view.scale;
        if (!drag.tx && Math.hypot(e.x - drag.start.x, e.y - drag.start.y) < 3) return;
        drag.tx ??= this.c.edits.begin({ key: "probe.moveFlag" });
        const id = drag.id;
        const o = { x: Math.round((drag.orig.x + dx) * 2) / 2, y: Math.round((drag.orig.y + dy) * 2) / 2 };
        drag.tx.update((d) => {
          if (d.probes[id]) d.probes[id].flag.offset = o;
        });
      },
      up: () => {
        drag?.tx?.commit();
        drag = undefined;
      },
    };
  }

  private quickProbe(e: CanvasPointer): boolean {
    const r = this.c.schematic;
    const hit = r?.hitTest(e)[0]?.target;
    if (!r || !hit) return false;
    const q = hit.kind === "segment" || hit.kind === "terminal" ? "voltage" : e.shiftKey ? "power" : "current";
    const live = this.live();
    const pick = targetFor(q, hit, r.view.toGrid(e), { terminals: (id) => r.terminalsOf(id), compiled: live?.compiled, display: live?.display });
    if (!pick) return false;
    this.placeProbe(pick.quantity, pick.target);
    return true;
  }

  /** Add a probe as one undoable edit; returns its id. */
  placeProbe(q: Parameters<typeof addProbe>[1], target: ProbeTarget): string {
    const id = `pr${Date.now().toString(36)}${++this.seq}`;
    this.c.edits.edit({ key: "probe.add" }, (d) => void addProbe(d, q, target, id, `ln${id}`));
    return id;
  }
}
