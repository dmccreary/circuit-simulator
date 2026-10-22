// The on-disk shape of a version-1 circuit file, and conversion to and from
// the in-memory CircuitDocument. Points are written as [x, y]; records keyed
// by id in memory are written as arrays.

import type {
  Annotation,
  CircuitDocument,
  NetLabel,
  Part,
  Point,
  Probe,
  Rotation,
  Slider,
  SubcircuitDefinition,
  Wire,
  MathTrace,
} from "@cs/model";
import { defaultSettings, makeProbe } from "../document";

export type XY = [number, number];

export interface FilePart {
  id: string;
  type: string;
  label: string;
  at: XY;
  rot?: Rotation;
  flip?: boolean;
  length?: number;
  props?: Record<string, number | string | boolean>;
  labelOffset?: XY;
  locked?: boolean;
  savedState?: number[];
}

export interface FileWire {
  id: string;
  points: XY[];
}

export type FileProbe = Omit<Probe, "flag" | "style" | "measurements"> &
  Partial<Pick<Probe, "style" | "measurements">> & { flag?: { offset: XY; showValue: boolean } };

export interface FileSubcircuit {
  id: string;
  name: string;
  parts: FilePart[];
  wires: FileWire[];
  netLabels?: { id: string; name: string; at: XY }[];
  pins: { name: string; at: XY; side: "left" | "right" | "top" | "bottom" }[];
  sealed?: boolean;
  readOnly?: boolean;
}

export interface CircuitFileV1 {
  format: "circuit-simulator";
  formatVersion: number;
  meta: { title: string; description: string };
  settings: CircuitDocument["settings"];
  parts: FilePart[];
  wires: FileWire[];
  netLabels?: { id: string; name: string; at: XY }[];
  annotations?: { id: string; kind: "text" | "box"; at: XY; text?: string; size?: XY }[];
  probes?: FileProbe[];
  lanes?: CircuitDocument["lanes"];
  mathTraces?: MathTrace[];
  sliders?: Slider[];
  subcircuits?: FileSubcircuit[];
  analyses?: CircuitDocument["analyses"];
  view?: { center: XY; zoom: number };
  netlist?: Record<string, unknown>;
}

export const FORMAT_NAME = "circuit-simulator";

const xy = (p: Point): XY => [p.x, p.y];
const pt = (a: XY | undefined): Point => ({ x: Number(a?.[0] ?? 0), y: Number(a?.[1] ?? 0) });
const nonEmpty = <T>(a: T[]): T[] | undefined => (a.length ? a : undefined);

/** Type used for parts whose type this build does not know (FIL-03, forward). */
export const UNKNOWN_PLACEHOLDER = "unknown:placeholder";

export function partToFile(p: Part): FilePart {
  if (p.type === UNKNOWN_PLACEHOLDER && typeof p.props.raw === "string") {
    // Write back exactly what we read, so a newer file survives a round trip.
    return JSON.parse(p.props.raw) as FilePart;
  }
  const out: FilePart = { id: p.id, type: p.type, label: p.label, at: xy(p.at), rot: p.orientation.rot };
  if (p.orientation.flip) out.flip = true;
  if (p.length !== undefined) out.length = p.length;
  if (Object.keys(p.props).length) out.props = { ...p.props };
  if (p.labelOffset) out.labelOffset = xy(p.labelOffset);
  if (p.locked) out.locked = true;
  if (p.savedState?.length) out.savedState = [...p.savedState];
  return out;
}

export function partFromFile(f: FilePart, isKnownType?: (type: string) => boolean): Part {
  if (isKnownType && !isKnownType(f.type)) {
    return {
      id: f.id,
      type: UNKNOWN_PLACEHOLDER,
      label: f.label ?? "",
      at: pt(f.at),
      orientation: { rot: normRot(f.rot), flip: !!f.flip },
      length: f.length,
      props: { originalType: f.type, raw: JSON.stringify(f) },
    };
  }
  const p: Part = {
    id: f.id,
    type: f.type,
    label: f.label ?? "",
    at: pt(f.at),
    orientation: { rot: normRot(f.rot), flip: !!f.flip },
    props: { ...(f.props ?? {}) },
  };
  if (f.length !== undefined) p.length = f.length;
  if (f.labelOffset) p.labelOffset = pt(f.labelOffset);
  if (f.locked) p.locked = true;
  if (f.savedState) p.savedState = [...f.savedState];
  return p;
}

function normRot(r: unknown): Rotation {
  const n = ((Math.round(Number(r ?? 0) / 90) * 90) % 360 + 360) % 360;
  return n as Rotation;
}

const wireToFile = (w: Wire): FileWire => ({ id: w.id, points: w.points.map(xy) });
const wireFromFile = (w: FileWire): Wire => ({ id: w.id, points: w.points.map(pt) });
const labelToFile = (n: NetLabel) => ({ id: n.id, name: n.name, at: xy(n.at) });
const labelFromFile = (n: { id: string; name: string; at: XY }): NetLabel => ({ id: n.id, name: n.name, at: pt(n.at) });

function subToFile(s: SubcircuitDefinition): FileSubcircuit {
  return {
    id: s.id,
    name: s.name,
    parts: Object.values(s.parts).map(partToFile),
    wires: Object.values(s.wires).map(wireToFile),
    netLabels: nonEmpty(Object.values(s.netLabels).map(labelToFile)),
    pins: s.pins.map((p) => ({ ...p, at: xy(p.at) })),
    sealed: s.sealed || undefined,
    readOnly: s.readOnly || undefined,
  };
}

function subFromFile(s: FileSubcircuit, isKnownType?: (t: string) => boolean): SubcircuitDefinition {
  return {
    id: s.id,
    name: s.name,
    parts: byId((s.parts ?? []).map((p) => partFromFile(p, isKnownType))),
    wires: byId((s.wires ?? []).map(wireFromFile)),
    netLabels: byId((s.netLabels ?? []).map(labelFromFile)),
    pins: (s.pins ?? []).map((p) => ({ ...p, at: pt(p.at) })),
    ...(s.sealed ? { sealed: true } : {}),
    ...(s.readOnly ? { readOnly: true } : {}),
  };
}

export function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const it of items) out[it.id] = it;
  return out;
}

export function documentToFile(doc: CircuitDocument): CircuitFileV1 {
  return {
    format: FORMAT_NAME,
    formatVersion: doc.formatVersion,
    meta: { ...doc.meta },
    settings: { ...doc.settings },
    parts: Object.values(doc.parts).map(partToFile),
    wires: Object.values(doc.wires).map(wireToFile),
    netLabels: nonEmpty(Object.values(doc.netLabels).map(labelToFile)),
    annotations: nonEmpty(
      Object.values(doc.annotations).map((a: Annotation) => ({
        id: a.id,
        kind: a.kind,
        at: xy(a.at),
        text: a.text,
        size: a.size ? xy(a.size) : undefined,
      })),
    ),
    probes: Object.values(doc.probes).map((p) => ({ ...p, flag: { offset: xy(p.flag.offset), showValue: p.flag.showValue } })),
    lanes: doc.lanes.map((l) => ({ ...l })),
    mathTraces: nonEmpty(Object.values(doc.mathTraces)),
    sliders: nonEmpty(Object.values(doc.sliders)),
    subcircuits: nonEmpty(Object.values(doc.subcircuits).map(subToFile)),
    analyses: Object.keys(doc.analyses).length ? doc.analyses : undefined,
    view: { center: xy(doc.view.center), zoom: doc.view.zoom },
  };
}

export function documentFromFile(f: CircuitFileV1, isKnownType?: (type: string) => boolean): CircuitDocument {
  return {
    formatVersion: f.formatVersion,
    meta: { title: f.meta?.title ?? "", description: f.meta?.description ?? "" },
    settings: { ...defaultSettings(), ...(f.settings ?? {}) },
    parts: byId((f.parts ?? []).map((p) => partFromFile(p, isKnownType))),
    wires: byId((f.wires ?? []).map(wireFromFile)),
    netLabels: byId((f.netLabels ?? []).map(labelFromFile)),
    annotations: byId(
      (f.annotations ?? []).map((a) => {
        const out: Annotation = { id: a.id, kind: a.kind, at: pt(a.at) };
        if (a.text !== undefined) out.text = a.text;
        if (a.size) out.size = pt(a.size);
        return out;
      }),
    ),
    probes: byId(
      (f.probes ?? []).map((p, i) =>
        makeProbe(
          {
            ...p,
            flag: p.flag ? { offset: pt(p.flag.offset), showValue: !!p.flag.showValue } : undefined,
          } as Probe,
          i,
        ),
      ),
    ),
    lanes: (f.lanes ?? []).map((l) => ({ ...l })),
    mathTraces: byId(f.mathTraces ?? []),
    sliders: byId(f.sliders ?? []),
    subcircuits: byId((f.subcircuits ?? []).map((s) => subFromFile(s, isKnownType))),
    analyses: { ...(f.analyses ?? {}) },
    view: f.view ? { center: pt(f.view.center), zoom: Number(f.view.zoom) || 1 } : { center: { x: 0, y: 0 }, zoom: 1 },
  };
}
