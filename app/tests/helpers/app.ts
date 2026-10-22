// Story harness (spec §25): the real AppController wired to the real
// EngineHost in-process on a virtual clock (as in packages/app/test/
// end-to-end.test.ts), with a SchematicRenderer drawing into a no-op 2-D
// context so the tool controller can hit-test. Callers need
// `// @vitest-environment jsdom`.
//
// Circuits are built the way a student builds them: parts placed with the
// Place tool, wires drawn with the Wire tool, probes placed with the probe
// tools. To keep layouts collision-free, each part gets a short wire stub
// from every terminal, ending at a net label naming its node (see build()).

import { getModelFactory } from "@cs/elements/models";
import { getDescriptor, terminalPositions } from "@cs/elements";
import { createDocument, type CircuitDocument, type Point, type PropValue, type Rotation } from "@cs/model";
import { EngineHost, type Command, type WorkerMessage } from "@cs/worker";
import { AppController } from "../../packages/app/src/controller";
import type { WorkerPort } from "../../packages/app/src/sim/sim-client";
import type { ToolSpec } from "../../packages/app/src/app-state";
import type { CanvasPointer } from "../../packages/app/src/tools/types";
import { stubCanvas } from "./canvas";

export { stubCanvas };

/** The real EngineHost in-process on a virtual clock. */
export function inProcessWorker() {
  let now = 0;
  const tasks: { at: number; fn: () => void }[] = [];
  const schedule = (fn: () => void, delayMs: number) => tasks.push({ at: now + Math.max(0, delayMs), fn });
  let port!: WorkerPort;
  const host = new EngineHost({
    now: () => now,
    schedule,
    post: (msg: WorkerMessage) => schedule(() => port.onmessage?.({ data: msg } as MessageEvent<WorkerMessage>), 0),
    getModelFactory,
  });
  port = {
    postMessage: (cmd: Command) => schedule(() => host.handle(structuredClone(cmd)), 0),
    onmessage: null,
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (let guard = 0; guard < 1e6; guard++) {
      tasks.sort((a, b) => a.at - b.at);
      const t = tasks[0];
      if (!t || t.at > end) break;
      tasks.shift();
      now = Math.max(now, t.at);
      t.fn();
    }
    now = end;
  };
  return { port, advance, host, get now() { return now; } };
}

/** One part as a student would place it: type, props, and the node each terminal joins (0 = ground). */
export interface PartSpec {
  label: string;
  type: string;
  props?: Record<string, PropValue>;
  nodes: number[];
}

const STUB = 2;
const SPACING = 16;

export class Story {
  readonly w = inProcessWorker();
  readonly c: AppController;
  /** Part ids by the label the story uses. */
  readonly ids: Record<string, string> = {};
  /** Stub wire ids: `${label}.${terminal}`. */
  readonly stubs: Record<string, string> = {};
  private clock = 1000;
  private placed = 0;

  constructor(doc: CircuitDocument = createDocument()) {
    stubCanvas();
    this.c = new AppController(doc, { worker: this.w.port });
    const host = document.createElement("div");
    const r = this.c.attachSchematic(host);
    r.resize(1600, 900, 1);
    r.view.setZoom(1);
    r.view.center = { x: 40, y: 0 };
    this.w.advance(50);
  }

  get doc(): CircuitDocument {
    return this.c.edits.doc;
  }

  // ------------------------------------------------------------ pointer

  screen(p: Point): Point {
    return this.c.schematic!.view.toScreen(p);
  }

  pointer(p: Point, extra: Partial<CanvasPointer> = {}): CanvasPointer {
    const s = this.screen(p);
    this.clock += 500; // never a double-click unless asked
    return { x: s.x, y: s.y, button: 0, shiftKey: false, time: this.clock, ...extra };
  }

  click(p: Point, extra: Partial<CanvasPointer> = {}): void {
    const e = this.pointer(p, extra);
    this.c.tools.pointerMove(e);
    this.c.tools.pointerDown(e);
    this.c.tools.pointerUp(e);
  }

  doubleClick(p: Point): void {
    const s = this.screen(p);
    this.clock += 500;
    for (const dt of [0, 10, 150, 160]) {
      const e: CanvasPointer = { x: s.x, y: s.y, button: 0, shiftKey: false, time: this.clock + dt };
      if (dt % 150 === 0 || dt === 0) this.c.tools.pointerDown(e);
      else this.c.tools.pointerUp(e);
    }
  }

  drag(from: Point, to: Point): void {
    const a = this.pointer(from);
    this.c.tools.pointerMove(a);
    this.c.tools.pointerDown(a);
    const b = this.pointer(to);
    this.c.tools.pointerMove(b);
    this.c.tools.pointerUp(b);
  }

  tool(t: ToolSpec): void {
    this.c.setTool(t);
  }

  key(k: string): void {
    this.c.tools.key({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
  }

  // ------------------------------------------------------------ building

  /** Place one part with the Place tool at grid point `at`; returns its id. */
  place(type: string, at: Point, rot: Rotation = 0, props: Record<string, PropValue> = {}): string {
    this.tool({ id: "place", type });
    for (let r = 0; r < rot; r += 90) this.key("r");
    const before = new Set(Object.keys(this.doc.parts));
    this.click(at);
    const id = Object.keys(this.doc.parts).find((k) => !before.has(k));
    if (!id) throw new Error(`placing ${type} at ${JSON.stringify(at)} added no part`);
    if (Object.keys(props).length) this.setProps(id, props);
    return id;
  }

  /** Edit values as the inspector does: one undoable transaction. */
  setProps(id: string, props: Record<string, PropValue>): void {
    this.c.edits.edit({ key: "edit.props" }, (d) => {
      Object.assign(d.parts[id].props, props);
    });
  }

  /** Draw a wire with the Wire tool (drag: right-angled route, horizontal first). */
  wire(from: Point, to: Point): string {
    this.tool({ id: "wire" });
    const before = new Set(Object.keys(this.doc.wires));
    this.drag(from, to);
    this.tool({ id: "select" });
    const id = Object.keys(this.doc.wires).find((k) => !before.has(k));
    if (!id) throw new Error(`wire ${JSON.stringify(from)} → ${JSON.stringify(to)} not drawn`);
    return id;
  }

  terminals(id: string): Point[] {
    const p = this.doc.parts[id];
    return terminalPositions(p, getDescriptor(p.type)!);
  }

  /** A net label on a grid point (the palette's label part). */
  netLabel(name: string, at: Point): void {
    this.c.edits.edit({ key: "edit.place" }, (d) => {
      const id = `nl${Object.keys(d.netLabels).length + 1}_${name}`;
      d.netLabels[id] = { id, name, at };
    });
  }

  /**
   * Build a circuit: each part is placed in its own column, every terminal
   * gets a stub wire pointing away from the part, and the stub's far end
   * gets a net label for its node ("GND" for 0, else "N<n>").
   */
  build(parts: PartSpec[]): void {
    for (const spec of parts) this.add(spec);
  }

  add(spec: PartSpec): string {
    const at = { x: SPACING * this.placed++, y: 0 };
    const id = this.place(spec.type, at, 0, spec.props ?? {});
    this.ids[spec.label] = id;
    this.c.edits.edit({ key: "edit.label" }, (d) => {
      d.parts[id].label = spec.label;
    });
    const pts = this.terminals(id);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    pts.forEach((p, k) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const horizontal = Math.abs(dx) >= Math.abs(dy) && dx !== 0;
      const end = horizontal ? { x: p.x + Math.sign(dx) * STUB, y: p.y } : { x: p.x, y: p.y + (dy < 0 ? -STUB : STUB) };
      this.stubs[`${spec.label}.${k}`] = this.wire(p, end);
      const node = spec.nodes[k];
      if (node !== undefined && node >= 0) this.netLabel(node === 0 ? "GND" : `N${node}`, end);
    });
    return id;
  }

  /** Midpoint of a part's terminal stub (a place to click a wire). */
  stubMid(label: string, terminal: number): Point {
    const w = this.doc.wires[this.stubs[`${label}.${terminal}`]];
    const [a, b] = w.points;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** Place a probe by clicking with a probe tool; returns the new probe id. */
  probe(kind: "probe-v" | "probe-i" | "probe-p", at: Point, extra: Partial<CanvasPointer> = {}): string {
    this.tool({ id: kind });
    const before = new Set(Object.keys(this.doc.probes));
    this.click(at, extra);
    this.tool({ id: "select" });
    const id = Object.keys(this.doc.probes).find((k) => !before.has(k));
    if (!id) throw new Error(`no probe placed at ${JSON.stringify(at)} with ${kind}`);
    return id;
  }

  // ------------------------------------------------------------ running

  /** Let the in-process worker run for `ms` of virtual wall time. */
  advance(ms: number): void {
    this.w.advance(ms);
  }

  run(ms: number): void {
    if (this.c.store.get().runState !== "running") this.c.commands.run("sim.runPause");
    this.w.advance(ms);
  }

  pause(): void {
    if (this.c.store.get().runState === "running") this.c.commands.run("sim.runPause");
    this.w.advance(20);
  }

  /** The latest value of a probe's channel. */
  value(probeId: string): number {
    const v = this.c.bus.lastValue(this.c.channelId(probeId));
    if (v === undefined) throw new Error(`no value yet for probe ${probeId}`);
    return v;
  }

  get display(): Float64Array {
    const f = this.c.bus.latest;
    if (!f) throw new Error("no frame yet");
    return f.display;
  }

  get time(): number {
    return this.c.bus.latest?.t1 ?? 0;
  }

  /** Readout of a part from the latest display state via the a11y/hover path. */
  node(label: string, terminal: number): number {
    const id = this.ids[label];
    const el = this.c.compiled!.netlist.elements.find((e) => e.id === id)!;
    return el.nodes[terminal];
  }

  dispose(): void {
    this.c.dispose();
  }
}
