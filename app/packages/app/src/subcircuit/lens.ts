// "Look inside" (EDT-36): the canvas shows one subcircuit definition as if it
// were the document, while the whole circuit keeps simulating. Edits made on
// that view land in the definition (so every instance sees them, EDT-38
// "all"), probes placed inside are stored at the top level with an instance
// path ("u1/r3", circuit-model.md §6) so their traces join the main chart,
// and the compiled circuit is re-keyed so live values show on the inner parts.

import type {
  ChannelSpec,
  CircuitDocument,
  CompiledCircuit,
  EditSystem,
  MessageRef,
  PartResolver,
  Point,
  Probe,
  ProbeTarget,
  SegmentInfo,
  SubcircuitDefinition,
  Transaction,
} from "@cs/model";
import { UnionFind, definitionOf, normalize, pointKey, probeTargetIds, syncInstances } from "@cs/model";
import type { SheetHooks } from "./sheet-hooks";

/** One level of the breadcrumb trail: an instance and the definition it opens. */
export interface SheetFrame {
  instance: string;
  definition: string;
  label: string;
}

const pathPrefix = (path: readonly SheetFrame[]) => path.map((f) => f.instance).join("/") + "/";

/** Probe target with every id relative to the sheet, or undefined if it points elsewhere. */
function strip(t: ProbeTarget, prefix: string): ProbeTarget | undefined {
  const local = (id: string) => (id.startsWith(prefix) && !id.slice(prefix.length).includes("/") ? id.slice(prefix.length) : undefined);
  if (t.kind === "between") {
    const a = strip(t.a, prefix);
    const b = strip(t.b, prefix);
    return a && b ? { ...t, a, b } : undefined;
  }
  if ("part" in t) {
    const id = local(t.part);
    return id === undefined ? undefined : { ...t, part: id };
  }
  const id = local(t.wire);
  return id === undefined ? undefined : { ...t, wire: id };
}

function addPrefix(t: ProbeTarget, prefix: string): ProbeTarget {
  if (t.kind === "between") return { ...t, a: addPrefix(t.a, prefix), b: addPrefix(t.b, prefix) };
  return "part" in t ? { ...t, part: prefix + t.part } : { ...t, wire: prefix + t.wire };
}

function innerProbes(probes: Record<string, Probe>, prefix: string): Record<string, Probe> {
  const out: Record<string, Probe> = {};
  for (const p of Object.values(probes)) {
    const target = strip(p.target, prefix);
    if (target) out[p.id] = { ...JSON.parse(JSON.stringify(p)), target };
  }
  return out;
}

export interface LensOptions {
  resolver: PartResolver;
  labelPrefix?: (type: string) => string | undefined;
}

export class SheetLens implements SheetHooks {
  readonly prefix: string;
  private cacheDoc: CircuitDocument | undefined;
  private cacheView: CircuitDocument | undefined;
  private cacheCompiledIn: CompiledCircuit | undefined;
  private cacheCompiledDoc: CircuitDocument | undefined;
  private cacheCompiled: CompiledCircuit | undefined;

  constructor(
    readonly path: readonly SheetFrame[],
    private opts: LensOptions,
  ) {
    if (!path.length) throw new Error("SheetLens needs at least one level");
    this.prefix = pathPrefix(path);
  }

  get definitionId(): string {
    return this.path[this.path.length - 1].definition;
  }

  /** The definition, if the path still leads to it. */
  definition(doc: CircuitDocument): SubcircuitDefinition | undefined {
    let parts = doc.parts;
    for (const f of this.path) {
      if (definitionOf(parts[f.instance]) !== f.definition) return undefined;
      const def = doc.subcircuits[f.definition];
      if (!def) return undefined;
      parts = def.parts;
    }
    return doc.subcircuits[this.definitionId];
  }

  view(doc: CircuitDocument): CircuitDocument | undefined {
    if (doc === this.cacheDoc) return this.cacheView;
    const def = this.definition(doc);
    this.cacheDoc = doc;
    this.cacheView = def && {
      ...doc,
      meta: { ...doc.meta, title: def.name },
      parts: def.parts,
      wires: def.wires,
      netLabels: def.netLabels,
      annotations: {},
      probes: innerProbes(doc.probes, this.prefix),
      sliders: {},
    };
    return this.cacheView;
  }

  /** Run a recipe on the view of a draft and write what it changed back into the definition. */
  apply(draft: CircuitDocument, recipe: (d: CircuitDocument) => void): void {
    const def = draft.subcircuits[this.definitionId];
    if (!def) return;
    const before = innerProbes(draft.probes, this.prefix);
    const view: CircuitDocument = {
      formatVersion: draft.formatVersion,
      meta: draft.meta,
      settings: draft.settings,
      parts: def.parts,
      wires: def.wires,
      netLabels: def.netLabels,
      annotations: {},
      probes: innerProbes(draft.probes, this.prefix),
      lanes: draft.lanes,
      mathTraces: draft.mathTraces,
      sliders: {},
      subcircuits: draft.subcircuits,
      analyses: draft.analyses,
      view: draft.view,
    };
    recipe(view);
    if (view.parts !== def.parts) def.parts = view.parts;
    if (view.wires !== def.wires) def.wires = view.wires;
    if (view.netLabels !== def.netLabels) def.netLabels = view.netLabels;
    if (view.lanes !== draft.lanes) draft.lanes = view.lanes;
    for (const id of Object.keys(before)) if (!view.probes[id]) delete draft.probes[id];
    for (const [id, p] of Object.entries(view.probes)) {
      if (JSON.stringify(p) === JSON.stringify(before[id])) continue;
      draft.probes[id] = { ...p, target: addPrefix(p.target, this.prefix) };
    }
    // Probes on parts deleted inside go too (top-level normalize cannot see them).
    for (const [id, p] of Object.entries(draft.probes)) {
      const local = strip(p.target, this.prefix);
      if (local && probeTargetIds(local).some((x) => !def.parts[x] && !def.wires[x])) delete draft.probes[id];
    }
  }

  begin(edits: EditSystem, label: MessageRef, options?: { coalesceKey?: string }): Transaction {
    const tx = edits.begin(label, options);
    let touched = false;
    const lens = this;
    return {
      get open() {
        return tx.open;
      },
      update(recipe) {
        touched = true;
        tx.update((d) => lens.apply(d, recipe));
      },
      commit() {
        if (touched && tx.open) {
          tx.update((d) => {
            lens.apply(d, (v) => normalize(v, lens.opts.resolver, { labelPrefix: lens.opts.labelPrefix }));
            syncInstances(d, lens.definitionId);
          });
        }
        tx.commit();
      },
      cancel: () => tx.cancel(),
    };
  }

  compiled(doc: CircuitDocument, compiled: CompiledCircuit | undefined): CompiledCircuit | undefined {
    if (!compiled) return undefined;
    if (compiled === this.cacheCompiledIn && doc === this.cacheCompiledDoc) return this.cacheCompiled;
    this.cacheCompiledIn = compiled;
    this.cacheCompiledDoc = doc;
    this.cacheCompiled = innerCompiled(doc, compiled, this.path, this.opts.resolver);
    return this.cacheCompiled;
  }
}

/**
 * The compiled circuit as seen from inside `path`: element ids relative to the
 * definition (others renamed out of the way, keeping the netlist order the
 * display state is laid out in), and grid points of the definition mapped to
 * the nodes they belong to.
 */
export function innerCompiled(doc: CircuitDocument, c: CompiledCircuit, path: readonly SheetFrame[], resolver: PartResolver): CompiledCircuit {
  const elementNodes = new Map(c.netlist.elements.map((e) => [e.id, e.nodes]));
  let pointToNode: Map<string, number> = c.pointToNode;
  let parts = doc.parts;
  let prefix = "";
  let def: SubcircuitDefinition | undefined;
  for (const f of path) {
    const inst = parts[f.instance];
    def = doc.subcircuits[f.definition];
    if (!inst || !def) break;
    const outer = terminals(inst, resolver).map((p) => pointToNode.get(pointKey(p)));
    prefix += `${f.instance}/`;
    pointToNode = sheetNodes(def, prefix, outer, elementNodes, resolver);
    parts = def.parts;
  }
  const local = (id: string) => (id.startsWith(prefix) && !id.slice(prefix.length).includes("/") ? id.slice(prefix.length) : `\u0000${id}`);
  const segments: SegmentInfo[] = [];
  for (const w of Object.values(def?.wires ?? {}))
    for (let i = 0; i + 1 < w.points.length; i++) {
      const node = pointToNode.get(pointKey(w.points[i]));
      if (node !== undefined) segments.push({ wire: w.id, segment: i, from: w.points[i], to: w.points[i + 1], node, terms: [] });
    }
  const channels: Record<string, ChannelSpec> = {};
  for (const [id, ch] of Object.entries(c.channels)) channels[id] = ch.kind === "current" || ch.kind === "power" ? { ...ch, element: local(ch.element) } : ch;
  return {
    ...c,
    netlist: { ...c.netlist, elements: c.netlist.elements.map((e) => ({ ...e, id: local(e.id) })) },
    pointToNode,
    segments,
    channels,
    identity: {},
    diagnostics: [],
  };
}

function terminals(part: import("@cs/model").Part, resolver: PartResolver): Point[] {
  try {
    return resolver.terminals(part);
  } catch {
    return [];
  }
}

/** Node of every grid point in a definition, from its pins and its elements' nodes. */
function sheetNodes(
  def: SubcircuitDefinition,
  prefix: string,
  pinNodes: (number | undefined)[],
  elementNodes: Map<string, number[]>,
  resolver: PartResolver,
): Map<string, number> {
  const uf = new UnionFind();
  const keys = new Set<string>();
  const anchors: Point[] = def.pins.map((p) => p.at);
  const seeds: [string, number][] = [];
  def.pins.forEach((p, i) => {
    keys.add(pointKey(p.at));
    const n = pinNodes[i];
    if (n !== undefined) seeds.push([pointKey(p.at), n]);
  });
  for (const part of Object.values(def.parts)) {
    const pts = terminals(part, resolver);
    const nodes = elementNodes.get(prefix + part.id);
    pts.forEach((p, i) => {
      keys.add(pointKey(p));
      anchors.push(p);
      if (nodes?.[i] !== undefined) seeds.push([pointKey(p), nodes[i]]);
    });
  }
  for (const l of Object.values(def.netLabels)) {
    keys.add(pointKey(l.at));
    anchors.push(l.at);
    uf.union(pointKey(l.at), `net:${l.name}`);
  }
  for (const w of Object.values(def.wires)) {
    w.points.forEach((p) => keys.add(pointKey(p)));
    if (w.points.length) anchors.push(w.points[0], w.points[w.points.length - 1]);
  }
  for (const w of Object.values(def.wires))
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      uf.union(pointKey(a), pointKey(b));
      for (const p of anchors) if (between(p, a, b)) uf.union(pointKey(a), pointKey(p));
    }
  const rootNode = new Map<string, number>();
  for (const [k, n] of seeds) if (!rootNode.has(uf.find(k))) rootNode.set(uf.find(k), n);
  const out = new Map<string, number>();
  for (const k of keys) {
    const n = rootNode.get(uf.find(k));
    if (n !== undefined) out.set(k, n);
  }
  return out;
}

const between = (p: Point, a: Point, b: Point) =>
  (a.y === b.y && p.y === a.y && p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x)) ||
  (a.x === b.x && p.x === a.x && p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y));
