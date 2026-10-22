// Falstad custom subcircuits (type 410) -> our subcircuit definitions and
// instances (EDT-34, FIL-16). Formats, from CircuitJS1:
//
//   Text model line, CustomCompositeModel.dump() / undump():
//     https://github.com/sharpie7/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/CustomCompositeModel.java
//     ". name flags sizeX sizeY pinCount (pinName node pos side)* nodeList elmDump"
//     nodeList: "\r"-separated lines "ClassName n1 n2 ...", one per inner element;
//     elmDump: " "-separated escaped dumps "flags params..." (coordinates removed).
//   XML model (the example library's form), SubcircuitModel.dumpXml():
//     https://github.com/pfalstad/circuitjs1/blob/master/ts/SubcircuitModel.ts
//     <ccm nm sx sy> <ext nm nd ps sd/>* then the inner elements, each with
//     its drawing position "x" and its node numbers "nn" (0 = ground).
//   Instance, CustomCompositeElm / SubcircuitElm: "410 x1 y1 x2 y2 flags name"
//     (XML <cc ... mo="name"/>), drawn as a ChipElm whose pins sit cspc2 = 32 px
//     apart (16 with FLAG_SMALL = 2); ChipElm.setPoints() places the posts.
//     Sides: 0 north, 1 south, 2 west, 3 east.
//
// Inner connectivity is the node numbers. The XML form also carries the
// drawing, which normally agrees with them; where two posts of one node are
// not joined by the drawing, net labels inside the definition join them.

import type { CircuitDocument, NetLabel, Point, SubcircuitDefinition } from "@cs/model";
import { encodeLayout, type BlockLayout, type PinSide } from "@cs/model";
import type { PartMapping } from "./mapping";
import type { FalstadCircuit, FalstadElement } from "./text";
import { unescapeFalstad } from "./text";
import type { XmlNode } from "./xml";

export interface FalstadSubcircuitModel {
  name: string;
  sizeX: number;
  sizeY: number;
  pins: { name: string; node: number; pos: number; side: number }[];
  elements: FalstadElement[];
  /** Node numbers per element, parallel to `elements`. */
  nodes: number[][];
  /** True when the elements carry real drawing positions (XML). */
  positioned: boolean;
}

const SIDES: PinSide[] = ["top", "bottom", "left", "right"];
const FLAG_SMALL = 2;
const FLIP_FLAGS = (1 << 10) | (1 << 11) | (1 << 12);

const int = (s: string | undefined, fallback = 0) => {
  const v = parseInt(s ?? "", 10);
  return Number.isFinite(v) ? v : fallback;
};

/** XML <ccm>, given the element reader the XML parser uses. */
export function readXmlModel(node: XmlNode, readElement: (n: XmlNode) => FalstadElement | null): FalstadSubcircuitModel {
  const m: FalstadSubcircuitModel = { name: node.attrs.nm ?? "", sizeX: int(node.attrs.sx, 2), sizeY: int(node.attrs.sy, 2), pins: [], elements: [], nodes: [], positioned: true };
  for (const c of node.children) {
    if (c.tag === "ext") {
      m.pins.push({ name: c.attrs.nm ?? "", node: int(c.attrs.nd), pos: int(c.attrs.ps), side: int(c.attrs.sd, 2) });
      continue;
    }
    if (c.attrs.x === undefined) continue;
    const el = readElement(c);
    if (!el) continue;
    m.elements.push(el);
    m.nodes.push((c.attrs.nn ?? "").trim().split(/\s+/).filter(Boolean).map((v) => int(v)));
  }
  return m;
}

/** Inner element class names (CirSim.constructElement) -> text type codes, for the text form. */
const CLASS_CODES: Record<string, string> = {
  ResistorElm: "r", CapacitorElm: "c", InductorElm: "l", DiodeElm: "d", ZenerElm: "z", LEDElm: "162",
  WireElm: "w", GroundElm: "g", DCVoltageElm: "v", ACVoltageElm: "v", VoltageElm: "v", RailElm: "R",
  CurrentElm: "i", SwitchElm: "s", PushSwitchElm: "s", LampElm: "181", LabeledNodeElm: "207",
  CustomCompositeElm: "410", SubcircuitElm: "410",
};

/** Text "." line (CustomCompositeModel.undump). */
export function readTextModel(raw: string): FalstadSubcircuitModel | null {
  const t = raw.trim().split(/[ \t]+/);
  if (t[0] !== "." || t.length < 7) return null;
  let k = 1;
  const name = unescapeFalstad(t[k++]);
  k++; // flags
  const sizeX = int(t[k++], 2);
  const sizeY = int(t[k++], 2);
  const count = int(t[k++]);
  const pins: FalstadSubcircuitModel["pins"] = [];
  for (let i = 0; i < count; i++) pins.push({ name: unescapeFalstad(t[k++] ?? ""), node: int(t[k++]), pos: int(t[k++]), side: int(t[k++], 2) });
  const nodeList = unescapeFalstad(t[k++] ?? "");
  const elmDump = unescapeFalstad(t[k++] ?? "");
  const dumps = elmDump.split(" ").filter(Boolean).map(unescapeFalstad);
  const m: FalstadSubcircuitModel = { name, sizeX, sizeY, pins, elements: [], nodes: [], positioned: false };
  nodeList
    .split("\r")
    .filter(Boolean)
    .forEach((line, i) => {
      const [cls, ...nn] = line.trim().split(/\s+/);
      const d = (dumps[i] ?? "0").split(" ");
      const y = 64 * i;
      m.elements.push({ code: CLASS_CODES[cls] ?? cls, x1: 0, y1: y, x2: 64, y2: y, flags: int(d[0]), params: d.slice(1), raw: line, line: 0 });
      m.nodes.push(nn.map((v) => int(v)));
    });
  return m;
}

type MapCircuit = (fc: FalstadCircuit) => { doc: CircuitDocument; report: { gridPixels: number; unsupported: unknown[] } };

export interface SubcircuitImport {
  /** PartMapping for one 410 element, or null when its model is missing. */
  rule(el: FalstadElement, unit: number): PartMapping | null;
  /** Definitions used so far, keyed by id. */
  definitions: Record<string, SubcircuitDefinition>;
}

const building = new Set<string>();

export function subcircuitImport(fc: FalstadCircuit, mapCircuit: MapCircuit): SubcircuitImport {
  const models = new Map((fc.subcircuits ?? []).map((m) => [m.name, m]));
  const definitions: Record<string, SubcircuitDefinition> = {};
  const idOf = (name: string) => `falstad-${name.replace(/[^A-Za-z0-9_-]+/g, "_")}`;

  const define = (m: FalstadSubcircuitModel): string | null => {
    const id = idOf(m.name);
    if (definitions[id]) return id;
    if (building.has(m.name)) return null; // a model that contains itself
    building.add(m.name);
    try {
      const inner = mapCircuit({ settings: null, elements: m.elements, scopes: [], sliders: [], hints: [], models: [], errors: [], subcircuits: fc.subcircuits });
      Object.assign(definitions, inner.doc.subcircuits);
      definitions[id] = toDefinition(id, m, inner.doc, inner.report.gridPixels);
      return id;
    } finally {
      building.delete(m.name);
    }
  };

  return {
    definitions,
    rule(el, unit) {
      const raw = el.params[0] ?? "";
      const name = el.raw.trimStart().startsWith("<") ? raw : unescapeFalstad(raw);
      const m = models.get(name);
      const id = m && define(m);
      if (!m || !id) return null;
      const layout: BlockLayout = {
        sizeX: Math.max(1, m.sizeX),
        sizeY: Math.max(1, m.sizeY),
        pins: m.pins.map((p) => ({ name: p.name, side: SIDES[p.side] ?? "left", pos: p.pos })),
      };
      // Falstad's post positions (ChipElm.setPoints, no flips) and ours, in Falstad pixels.
      const c = el.flags & FLAG_SMALL ? 16 : 32;
      const ax = Math.round(el.x1 / unit) * unit;
      const ay = Math.round(el.y1 / unit) * unit;
      const wires: [number, number][][] = [];
      layout.pins.forEach((p) => {
        const theirs: [number, number] =
          p.side === "left" ? [el.x1, el.y1 + c * p.pos]
          : p.side === "right" ? [el.x1 + c + c * layout.sizeX, el.y1 + c * p.pos]
          : p.side === "top" ? [el.x1 + c + c * p.pos, el.y1 - c]
          : [el.x1 + c + c * p.pos, el.y1 + c * layout.sizeY];
        const local = ourPin(layout, p);
        const ours: [number, number] = [ax + local.x * unit, ay + local.y * unit];
        if (theirs[0] !== ours[0] || theirs[1] !== ours[1]) wires.push([theirs, ours]);
      });
      return {
        type: "subcircuit",
        props: { definition: id, pinLayout: encodeLayout(layout), name: m.name },
        posts: Math.min(4, Math.max(1, m.pins.length)) as PartMapping["posts"],
        place: { at: [el.x1, el.y1], toward: [el.x1 + 4 * unit, el.y1], flip: false },
        fixedLength: 4,
        wires,
        approximate: (el.flags & FLIP_FLAGS) !== 0 || undefined,
      };
    },
  };
}

/** Local pin position of our block (same as @cs/model pinPoint; kept here to stay pure data). */
function ourPin(l: BlockLayout, p: { side: PinSide; pos: number }): Point {
  if (p.side === "left") return { x: 0, y: 2 * p.pos };
  if (p.side === "right") return { x: 2 + 2 * l.sizeX, y: 2 * p.pos };
  if (p.side === "top") return { x: 2 + 2 * p.pos, y: -2 };
  return { x: 2 + 2 * p.pos, y: 2 * l.sizeY };
}

/** Falstad's posts of an element we can locate: point 1 and point 2 of one- and two-post elements. */
function posts(el: FalstadElement, nn: number[]): [number, number][] | null {
  if (nn.length > 2) return null;
  if (nn.length === 1) return [[el.x1, el.y1]];
  return [
    [el.x1, el.y1],
    [el.x2, el.y2],
  ];
}

function toDefinition(id: string, m: FalstadSubcircuitModel, doc: CircuitDocument, unit: number): SubcircuitDefinition {
  const g = ([x, y]: [number, number]): Point => ({ x: Math.round(x / unit), y: Math.round(y / unit) });
  const key = (p: Point) => `${p.x},${p.y}`;
  const netLabels: Record<string, NetLabel> = { ...doc.netLabels };
  let n = 0;
  const label = (name: string, at: Point) => {
    const lid = `sl${++n}`;
    netLabels[lid] = { id: lid, name, at };
  };

  // Where each node's posts are, and which of them the drawing already joins.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const p = parent.get(k) ?? k;
    if (p === k) return k;
    const r = find(p);
    parent.set(k, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const byNode = new Map<number, Point[]>();
  m.elements.forEach((el, i) => {
    const pts = posts(el, m.nodes[i] ?? [])?.map(g);
    if (!pts) return;
    pts.forEach((p, j) => {
      const nd = m.nodes[i][j];
      const list = byNode.get(nd) ?? [];
      if (!list.some((q) => key(q) === key(p))) list.push(p);
      byNode.set(nd, list);
    });
    if (m.positioned && el.code === "w" && pts.length === 2) union(key(pts[0]), key(pts[1]));
    if (m.positioned && el.code === "207") union(key(pts[0]), `name:${el.params.join(" ")}`);
    if (m.positioned && el.code === "g") union(key(pts[0]), "name:GND");
  });
  for (const [nd, pts] of byNode) {
    if (nd === 0) {
      for (const p of pts) if (!m.positioned || find(key(p)) !== find("name:GND")) label("GND", p);
      continue;
    }
    const comps = new Map<string, Point>();
    for (const p of pts) if (!comps.has(find(key(p)))) comps.set(m.positioned ? find(key(p)) : key(p), p);
    if (comps.size > 1) for (const p of comps.values()) label(`n${nd}`, p);
  }

  const pins = m.pins.map((pin) => {
    const at = byNode.get(pin.node)?.[0] ?? { x: -4, y: 4 * pin.pos };
    return { name: pin.name, at, side: SIDES[pin.side] ?? ("left" as PinSide) };
  });
  return { id, name: m.name, parts: doc.parts, wires: doc.wires, netLabels, pins };
}
