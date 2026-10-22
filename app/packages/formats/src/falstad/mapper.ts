// FalstadCircuit -> CircuitDocument (files-and-persistence.md §4.1, FIL-16, FIL-17).

import type { Annotation, CircuitDocument, MessageRef, NetLabel, Part, Point, Probe, Rotation, Slider, Wire } from "@cs/model";
import { emptyDocument, makeLane, makeProbe } from "../document";
import { FALSTAD_PARTS, LABEL_PREFIX, ONE_POST_CODES, PLACEHOLDER_TYPE, type PartMapping } from "./mapping";
import { isFalstadXml, parseFalstadXml } from "./xml-circuit";
import { subcircuitImport } from "./subcircuit";
import { expandBuses } from "./bus";
import { falstadPoints, hopRoute } from "./wire-hops";
import { planBends, wireCorner, wireInteriors, type Bend, type DiagonalPart } from "./diagonals";
import { parseFalstadText, unescapeFalstad, type FalstadCircuit, type FalstadElement, type FalstadSettings } from "./text";

export interface FalstadImportReport {
  /** Elements imported as placeholders (FIL-16). */
  unsupported: { line: number; code: string; raw: string; partId: string }[];
  warnings: { line?: number; message: MessageRef }[];
  /** Lines that could not be parsed at all. */
  ignored: { line: number; raw: string }[];
  /** Falstad pixels per grid unit used for this import (16, or 8 for small-grid circuits). */
  gridPixels: number;
  /** Falstad's settings line; speed and current speed have no document field yet. */
  settings: FalstadSettings | null;
}

const HINTS: Record<number, string> = {
  1: "Resonant frequency of {a} and {b}",
  2: "Time constant of {a} and {b}",
  3: "Cutoff frequency of {a} and {b}",
  4: "Notch frequency of {a} and {b}",
  5: "Cutoff frequency of {a} and {b}",
};

/** Import Falstad's text or XML (<cir ...>) circuit format (FIL-14, FIL-15). */
export function importFalstad(text: string): { doc: CircuitDocument; report: FalstadImportReport } {
  return mapFalstadCircuit(isFalstadXml(text) ? parseFalstadXml(text) : parseFalstadText(text));
}

export function mapFalstadCircuit(fc: FalstadCircuit, title = ""): { doc: CircuitDocument; report: FalstadImportReport } {
  const doc = emptyDocument(title);
  // Text and drawings (TextElm, BoxElm, LineElm) sit anywhere; only connectable elements choose the grid.
  const placed = fc.elements.filter((e) => !GRAPHIC_CODES.has(e.code));
  const unit = chooseGrid(placed);
  // Multi-bit buses (XML chips with bit order "bus") become one net per bit (bus.ts).
  fc = expandBuses(fc, unit);
  const report: FalstadImportReport = {
    unsupported: [],
    warnings: [],
    ignored: fc.errors.map((e) => ({ ...e })),
    gridPixels: unit,
    settings: fc.settings,
  };
  if (unit === 16 && placed.some((e) => [e.x1, e.y1, e.x2, e.y2].some((v) => v % 16 !== 0))) {
    report.warnings.push({ message: { key: "falstad.offGrid" } });
  }
  const g = (x: number, y: number): Point => ({ x: Math.round(x / unit), y: Math.round(y / unit) });

  const counters: Record<string, number> = {};
  const nextLabel = (type: string): string => {
    const prefix = LABEL_PREFIX[type] ?? "X";
    if (!prefix) return "";
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}${counters[prefix]}`;
  };

  /** Falstad post points, which a wire running past them must not touch (wire-hops.ts). */
  const posts = falstadPoints(fc.elements, g);
  /** Falstad end points on our grid, where straightened parts must not land. */
  const occupied = new Set(fc.elements.flatMap((e) => [pointKey(g(e.x1, e.y1)), pointKey(g(e.x2, e.y2))]));
  let n = 0;
  const addWire = (a: Point, b: Point) => {
    if (a.x === b.x && a.y === b.y) return;
    const id = `w${++n}`;
    const points = a.x === b.x || a.y === b.y ? [a, b] : [a, wireCorner(a, b, posts), b];
    doc.wires[id] = { id, points } satisfies Wire;
  };

  // Custom subcircuits (410): definitions built from the circuit's models.
  const subcircuits = subcircuitImport(fc, mapFalstadCircuit);

  const plannedBends = planDiagonals(fc, unit, g, posts, subcircuits.rule);

  /** Scopes drawn on the canvas (ScopeElm, 403), charted like the "o" lines. */
  const embeddedScopes: FalstadCircuit["scopes"] = [];

  /** Falstad element index -> our part id (wires and text map to null). */
  const byIndex: (string | null)[] = [];
  const mappings: (PartMapping | null)[] = [];

  for (const el of fc.elements) {
    const p1 = g(el.x1, el.y1);
    const p2 = g(el.x2, el.y2);
    if (el.code === "w") {
      byIndex.push(null);
      mappings.push(null);
      if (el.route) {
        const pts = el.route.map(([x, y]) => g(x, y));
        for (let k = 1; k < pts.length; k++) addWire(pts[k - 1], pts[k]);
      } else {
        const hop = hopRoute(p1, p2, posts);
        if (hop) doc.wires[`w${++n}`] = { id: `w${n}`, points: hop } satisfies Wire;
        else addWire(p1, p2);
      }
      continue;
    }
    if (el.code === "207") {
      // LabeledNodeElm: the post is point1; the name is drawn at point2 at the end of a lead.
      byIndex.push(null);
      mappings.push(null);
      const name = el.flags & 4 ? unescapeFalstad(el.params[0] ?? "") : el.params.join(" ");
      const id = `n${++n}`;
      if (p1.x !== p2.x || p1.y !== p2.y) addWire(p1, p2);
      doc.netLabels[id] = { id, name: name || id, at: p2 } satisfies NetLabel;
      continue;
    }
    if (el.code === "403") {
      // ScopeElm: a scope drawn on the canvas, dumped as the "o" line's tokens joined by "_"
      // (Scope.dump()). It becomes a chart lane like any other scope.
      byIndex.push(null);
      mappings.push(null);
      const t = (el.params[0] ?? "").split("_");
      const tok = (i: number) => Number(t[i] ?? 0) || 0;
      embeddedScopes.push({ element: tok(0), speed: tok(1), value: tok(2), flags: tok(3), raw: el.raw });
      continue;
    }
    if (el.code === "b" || el.code === "423") {
      // BoxElm becomes a box annotation; LineElm (a drawn line) has no counterpart and is dropped.
      byIndex.push(null);
      mappings.push(null);
      if (el.code === "423") {
        report.warnings.push({ line: el.line, message: { key: "falstad.lineSkipped" } });
        continue;
      }
      const id = `a${++n}`;
      const a = g(Math.min(el.x1, el.x2), Math.min(el.y1, el.y2));
      const b = g(Math.max(el.x1, el.x2), Math.max(el.y1, el.y2));
      doc.annotations[id] = { id, kind: "box", at: a, size: { x: b.x - a.x, y: b.y - a.y } } satisfies Annotation;
      continue;
    }
    if (el.code === "x") {
      byIndex.push(null);
      mappings.push(null);
      const id = `a${++n}`;
      doc.annotations[id] = { id, kind: "text", at: p1, text: falstadText(el) } satisfies Annotation;
      continue;
    }

    const rule = el.code === "410" ? subcircuits.rule : FALSTAD_PARTS[el.code];
    let spec: PartMapping | null = null;
    try {
      spec = rule ? rule(el, unit, fc) : null;
    } catch {
      spec = null;
    }
    const id = `p${++n}`;
    if (!spec) {
      spec = {
        type: PLACEHOLDER_TYPE,
        props: { falstadType: el.code, falstadLine: el.raw, terminals: ONE_POST_CODES.has(el.code) ? 1 : 2 },
        posts: ONE_POST_CODES.has(el.code) ? 1 : 2,
      };
      report.unsupported.push({ line: el.line, code: el.code, raw: el.raw, partId: id });
    }
    const from = spec.place ? g(...spec.place.at) : spec.reversed ? p2 : p1;
    const toward = spec.place ? g(...spec.place.toward) : spec.reversed ? p1 : p2;
    let geom = placement(from, toward);
    if (geom.diagonal) {
      report.warnings.push({ line: el.line, message: { key: "falstad.diagonal", values: { part: id } } });
      // A straightened two-terminal part keeps its far terminal connected through a wire,
      // along whichever axis leaves that terminal and wire clear of other connections.
      if (!spec.place && spec.posts === 2 && spec.fixedLength === undefined) {
        const bend = plannedBends.get(el);
        if (bend) {
          geom = placement(from, bend.bend);
          occupied.add(pointKey(bend.bend));
          doc.wires[`w${++n}`] = { id: `w${n}`, points: bend.path } satisfies Wire;
        } else for (const option of [geom, placement(from, toward, true)]) {
          const end = axisEnd(from, option);
          if (occupied.has(pointKey(end)) || !segmentClear(end, toward, occupied)) continue;
          geom = option;
          occupied.add(pointKey(end));
          addWire(end, toward);
          break;
        }
      }
    }
    const part: Part = {
      id,
      type: spec.type,
      label: nextLabel(spec.type),
      at: from,
      orientation: { rot: geom.rot, flip: spec.place?.flip ?? false },
      props: spec.props,
    };
    if (spec.fixedLength !== undefined) {
      if (geom.length !== spec.fixedLength) {
        report.warnings.push({ line: el.line, message: { key: "falstad.lengthChanged", values: { part: id, from: geom.length, to: spec.fixedLength } } });
      }
    } else if (spec.posts >= 2 || spec.stretch) part.length = geom.length;
    if (spec.savedState) part.savedState = spec.savedState;
    doc.parts[id] = part;
    for (const w of spec.wires ?? []) {
      for (let k = 1; k < w.length; k++) addWire(g(...w[k - 1]), g(...w[k]));
    }
    for (const l of spec.netLabels ?? []) {
      const lid = `n${++n}`;
      doc.netLabels[lid] = { id: lid, name: l.name, at: g(...l.at) } satisfies NetLabel;
    }
    if (spec.slider) {
      const sid = `vs${Object.keys(doc.sliders).length + 1}`;
      doc.sliders[sid] = { id: sid, part: id, prop: spec.slider.prop, min: spec.slider.min, max: spec.slider.max };
    }
    if (spec.approximate) report.warnings.push({ line: el.line, message: { key: "falstad.approximated", values: { part: id } } });
    byIndex.push(id);
    mappings.push(spec);
  }

  Object.assign(doc.subcircuits, subcircuits.definitions);
  mapScopes({ ...fc, scopes: [...fc.scopes, ...embeddedScopes] }, doc, byIndex, report);
  mapSliders(fc, doc, byIndex, mappings, report);

  const labelOf = (i: number) => {
    const id = byIndex[i];
    return id ? doc.parts[id].label : `#${i}`;
  };
  const hintLines = fc.hints
    .filter((h) => HINTS[h.type])
    .map((h) => HINTS[h.type].replace("{a}", labelOf(h.item1)).replace("{b}", labelOf(h.item2)));
  doc.meta.description = hintLines.join("\n");

  // Falstad's time step belongs to its fixed-step method; ours is chosen automatically
  // (SIM-07), so the value stays in report.settings and is not imported as a limit.
  doc.view.center = centerOf(doc);
  return { doc, report };
}

const GRAPHIC_CODES = new Set(["x", "b", "423", "403"]);

/** Bends for the diagonal two-terminal parts, planned together (diagonals.ts). */
function planDiagonals(
  fc: FalstadCircuit,
  unit: number,
  g: (x: number, y: number) => Point,
  posts: Set<string>,
  composite: (el: FalstadElement, unit: number) => PartMapping | null,
): Map<FalstadElement, Bend> {
  const parts: DiagonalPart[] = [];
  fc.elements.forEach((el, index) => {
    if (el.code === "w" || el.code === "207" || GRAPHIC_CODES.has(el.code)) return;
    const rule = el.code === "410" ? composite : FALSTAD_PARTS[el.code];
    let spec: PartMapping | null = null;
    try {
      spec = rule ? rule(el, unit) : null;
    } catch {
      spec = null;
    }
    if (!spec || spec.place || spec.posts !== 2 || spec.fixedLength !== undefined) return;
    const p1 = g(el.x1, el.y1);
    const p2 = g(el.x2, el.y2);
    const [from, toward] = spec.reversed ? [p2, p1] : [p1, p2];
    if (from.x !== toward.x && from.y !== toward.y) parts.push({ index, from, toward });
  });
  const plan = planBends(parts, posts, wireInteriors(fc.elements, g));
  return new Map([...plan].map(([i, bend]) => [fc.elements[i], bend]));
}

function chooseGrid(els: FalstadElement[]): number {
  const coords = els.flatMap((e) => [e.x1, e.y1, e.x2, e.y2]);
  if (coords.every((v) => v % 16 === 0)) return 16;
  if (coords.every((v) => v % 8 === 0)) return 8;
  return 16;
}

/** Two-point placement -> rotation (clockwise, y down) and length along that axis. */
function placement(a: Point, b: Point, minorAxis = false): { rot: Rotation; length: number; diagonal: boolean } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const diagonal = dx !== 0 && dy !== 0;
  if (Math.abs(dx) >= Math.abs(dy) !== minorAxis) return { rot: dx >= 0 ? 0 : 180, length: Math.abs(dx), diagonal };
  return { rot: dy > 0 ? 90 : 270, length: Math.abs(dy), diagonal };
}

const pointKey = (p: Point) => `${p.x},${p.y}`;

/** Far terminal of a straightened part: `length` along its rotation from `a`. */
function axisEnd(a: Point, geom: { rot: Rotation; length: number }): Point {
  const r = (geom.rot * Math.PI) / 180;
  return { x: a.x + Math.round(Math.cos(r)) * geom.length, y: a.y + Math.round(Math.sin(r)) * geom.length };
}

/** No occupied point strictly inside the straight segment a-b. */
function segmentClear(a: Point, b: Point, occupied: Set<string>): boolean {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  for (let k = 1; k < n; k++) {
    const p = { x: a.x + Math.round(((b.x - a.x) * k) / n), y: a.y + Math.round(((b.y - a.y) * k) / n) };
    if (occupied.has(pointKey(p))) return false;
  }
  return true;
}

// TextElm: size text (escaped when flag 4 is set, else the rest of the line)
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/TextElm.java
function falstadText(el: FalstadElement): string {
  if (el.flags & 4) return unescapeFalstad(el.params[1] ?? "");
  return el.params.slice(1).join(" ").replace(/%2[bB]/g, "+");
}

// Scope value codes from Scope.java: 0 voltage, 3 current, 7 power.
function mapScopes(fc: FalstadCircuit, doc: CircuitDocument, byIndex: (string | null)[], report: FalstadImportReport) {
  fc.scopes.forEach((sc, i) => {
    const partId = byIndex[sc.element];
    if (!partId) {
      report.warnings.push({ message: { key: "falstad.scopeSkipped", values: { scope: i + 1 } } });
      return;
    }
    const laneId = `l${i + 1}`;
    doc.lanes.push(makeLane(laneId));
    const part = doc.parts[partId];
    const quantity: Probe["quantity"] = sc.value === 3 ? "current" : sc.value === 7 ? "power" : "voltage";
    const target: Probe["target"] =
      quantity === "current" ? { kind: "through", part: partId, reversed: false } : { kind: "across", part: partId };
    const id = `r${i + 1}`;
    const name = `${quantity === "current" ? "I" : quantity === "power" ? "P" : "V"}(${part.label || partId})`;
    doc.probes[id] = makeProbe({ id, name, quantity, target, lane: laneId }, i);
  });
}

function mapSliders(
  fc: FalstadCircuit,
  doc: CircuitDocument,
  byIndex: (string | null)[],
  mappings: (PartMapping | null)[],
  report: FalstadImportReport,
) {
  fc.sliders.forEach((s, i) => {
    const partId = byIndex[s.element];
    const prop = mappings[s.element]?.sliderProps?.[s.editItem];
    if (!partId || !prop) {
      report.warnings.push({ message: { key: "falstad.sliderSkipped", values: { slider: s.text || String(i + 1) } } });
      return;
    }
    const id = `s${i + 1}`;
    const slider: Slider = { id, part: partId, prop, min: s.min, max: s.max };
    if (s.flags & 2) slider.log = true;
    doc.sliders[id] = slider;
  });
}

function centerOf(doc: CircuitDocument): Point {
  const pts: Point[] = [
    ...Object.values(doc.parts).map((p) => p.at),
    ...Object.values(doc.wires).flatMap((w) => w.points),
  ];
  if (!pts.length) return { x: 0, y: 0 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) };
}
