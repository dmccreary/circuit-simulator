// FalstadCircuit -> CircuitDocument (files-and-persistence.md §4.1, FIL-16, FIL-17).

import type { Annotation, CircuitDocument, MessageRef, Part, Point, Probe, Rotation, Slider, Wire } from "@cs/model";
import { emptyDocument, makeLane, makeProbe } from "../document";
import { FALSTAD_PARTS, LABEL_PREFIX, ONE_POST_CODES, PLACEHOLDER_TYPE, type PartMapping } from "./mapping";
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

export function importFalstad(text: string): { doc: CircuitDocument; report: FalstadImportReport } {
  return mapFalstadCircuit(parseFalstadText(text));
}

export function mapFalstadCircuit(fc: FalstadCircuit, title = ""): { doc: CircuitDocument; report: FalstadImportReport } {
  const doc = emptyDocument(title);
  const unit = chooseGrid(fc.elements);
  const report: FalstadImportReport = {
    unsupported: [],
    warnings: [],
    ignored: fc.errors.map((e) => ({ ...e })),
    gridPixels: unit,
    settings: fc.settings,
  };
  if (unit === 16 && fc.elements.some((e) => [e.x1, e.y1, e.x2, e.y2].some((v) => v % 16 !== 0))) {
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

  /** Falstad element index -> our part id (wires and text map to null). */
  const byIndex: (string | null)[] = [];
  const mappings: (PartMapping | null)[] = [];
  let n = 0;

  for (const el of fc.elements) {
    const p1 = g(el.x1, el.y1);
    const p2 = g(el.x2, el.y2);
    if (el.code === "w") {
      byIndex.push(null);
      mappings.push(null);
      if (p1.x === p2.x && p1.y === p2.y) continue;
      const id = `w${++n}`;
      const points = p1.x === p2.x || p1.y === p2.y ? [p1, p2] : [p1, { x: p2.x, y: p1.y }, p2];
      doc.wires[id] = { id, points } satisfies Wire;
      continue;
    }
    if (el.code === "x") {
      byIndex.push(null);
      mappings.push(null);
      const id = `a${++n}`;
      doc.annotations[id] = { id, kind: "text", at: p1, text: falstadText(el) } satisfies Annotation;
      continue;
    }

    const rule = FALSTAD_PARTS[el.code];
    let spec: PartMapping | null = null;
    try {
      spec = rule ? rule(el) : null;
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
    const geom = placement(from, toward);
    if (geom.diagonal) report.warnings.push({ line: el.line, message: { key: "falstad.diagonal", values: { part: id } } });
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
    } else if (spec.posts >= 2) part.length = geom.length;
    if (spec.savedState) part.savedState = spec.savedState;
    doc.parts[id] = part;
    byIndex.push(id);
    mappings.push(spec);
  }

  mapScopes(fc, doc, byIndex, report);
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

function chooseGrid(els: FalstadElement[]): number {
  const coords = els.flatMap((e) => [e.x1, e.y1, e.x2, e.y2]);
  if (coords.every((v) => v % 16 === 0)) return 16;
  if (coords.every((v) => v % 8 === 0)) return 8;
  return 16;
}

/** Two-point placement -> rotation (clockwise, y down) and length along that axis. */
function placement(a: Point, b: Point): { rot: Rotation; length: number; diagonal: boolean } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const diagonal = dx !== 0 && dy !== 0;
  if (Math.abs(dx) >= Math.abs(dy)) return { rot: dx >= 0 ? 0 : 180, length: Math.abs(dx), diagonal };
  return { rot: dy > 0 ? 90 : 270, length: Math.abs(dy), diagonal };
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
