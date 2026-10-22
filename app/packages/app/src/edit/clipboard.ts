import type { CircuitDocument, Part, Point, Wire } from "@cs/model";

/** What Copy puts on the clipboard: plain circuit JSON, so it pastes into another tab or embed (EDT-22). */
export interface CircuitFragment {
  kind: "circuit-simulator/fragment";
  version: 1;
  parts: Part[];
  wires: Wire[];
}

export function makeFragment(doc: CircuitDocument, ids: readonly string[]): CircuitFragment | undefined {
  const parts = ids.map((id) => doc.parts[id]).filter((p): p is Part => !!p);
  const wires = ids.map((id) => doc.wires[id]).filter((w): w is Wire => !!w);
  if (!parts.length && !wires.length) return undefined;
  return { kind: "circuit-simulator/fragment", version: 1, parts: structuredClone(parts), wires: structuredClone(wires) };
}

export function serializeFragment(f: CircuitFragment): string {
  return JSON.stringify(f);
}

const isPoint = (p: unknown): p is Point =>
  !!p && typeof p === "object" && Number.isFinite((p as Point).x) && Number.isFinite((p as Point).y);

/** Parse clipboard text; anything that is not a fragment is ignored. */
export function parseFragment(text: string): CircuitFragment | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  const r = raw as Partial<CircuitFragment> | null;
  if (!r || r.kind !== "circuit-simulator/fragment" || r.version !== 1 || !Array.isArray(r.parts) || !Array.isArray(r.wires)) return undefined;
  const parts = r.parts.filter(
    (p): p is Part => !!p && typeof p.type === "string" && isPoint(p.at) && !!p.orientation && !!p.props && typeof p.props === "object",
  );
  const wires = r.wires.filter((w): w is Wire => !!w && Array.isArray(w.points) && w.points.length >= 2 && w.points.every(isPoint));
  return { kind: r.kind, version: 1, parts, wires };
}

/** Top-left of everything in the fragment. */
export function fragmentOrigin(f: CircuitFragment): Point {
  const pts = [...f.parts.map((p) => p.at), ...f.wires.flatMap((w) => w.points)];
  return { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
}

/**
 * Add the fragment to the document shifted by (dx, dy), with fresh ids and
 * labels that do not clash. Returns the new ids, for selecting them.
 */
export function pasteFragment(
  draft: CircuitDocument,
  f: CircuitFragment,
  offset: Point,
  newId: (prefix: string) => string,
  labelFor: (draft: CircuitDocument, part: Part) => string,
): string[] {
  const ids: string[] = [];
  const shift = (p: Point): Point => ({ x: Math.round(p.x + offset.x), y: Math.round(p.y + offset.y) });
  const used = new Set(Object.values(draft.parts).map((p) => p.label));
  for (const src of f.parts) {
    const id = newId("p");
    const part: Part = { ...structuredClone(src), id, at: shift(src.at) };
    delete part.locked;
    if (!part.label || used.has(part.label)) part.label = labelFor(draft, part);
    used.add(part.label);
    draft.parts[id] = part;
    ids.push(id);
  }
  for (const src of f.wires) {
    const id = newId("w");
    draft.wires[id] = { id, points: src.points.map(shift) };
    ids.push(id);
  }
  return ids;
}
