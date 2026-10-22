// Creating probes in a document draft: names (V1, I2, P1, L1), colors, and the
// lane each quantity goes to (PRB-01, PRB-13).

import type { CircuitDocument, Probe, ProbeTarget } from "@cs/model";

export type Quantity = Probe["quantity"];

const PREFIX: Record<Quantity, string> = { voltage: "V", current: "I", power: "P", logic: "L" };

/** The next free name for a quantity: "I3" when I1 and I2 exist. */
export function nextProbeName(doc: CircuitDocument, q: Quantity): string {
  const prefix = PREFIX[q];
  const used = new Set(Object.values(doc.probes).map((p) => p.name));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** The first color token not in use (eight before repeating, PRB-13), else cycling. */
export function nextProbeColor(doc: CircuitDocument, palette = 8): string {
  const used = new Set(Object.values(doc.probes).map((p) => p.style.color));
  for (let i = 1; i <= palette; i++) if (!used.has(`probe.${i}`)) return `probe.${i}`;
  return `probe.${(Object.keys(doc.probes).length % palette) + 1}`;
}

/**
 * The lane a new probe joins: logic probes share a logic lane; analog probes
 * join the first analog lane whose probes have the same quantity (a lane has
 * one unit), else an empty analog lane, else a new one with `laneId`.
 */
export function laneFor(draft: CircuitDocument, q: Quantity, laneId: string): string {
  const kind = q === "logic" ? "logic" : "analog";
  const probes = Object.values(draft.probes);
  const lanes = draft.lanes.filter((l) => l.kind === kind);
  const fit =
    lanes.find((l) => {
      const first = probes.find((p) => p.lane === l.id);
      return first ? first.quantity === q : false;
    }) ?? lanes.find((l) => !probes.some((p) => p.lane === l.id));
  if (fit) return fit.id;
  draft.lanes.push(kind === "analog" ? { id: laneId, kind, yScale: { mode: "auto" } } : { id: laneId, kind });
  return laneId;
}

/** Add a probe; returns its name. */
export function addProbe(draft: CircuitDocument, q: Quantity, target: ProbeTarget, probeId: string, laneId: string): string {
  const name = nextProbeName(draft, q);
  const lane = laneFor(draft, q, laneId);
  draft.probes[probeId] = {
    id: probeId,
    name,
    quantity: q,
    target,
    style: { color: nextProbeColor(draft), width: 1.5 },
    lane,
    flag: { offset: { x: 1, y: -2 }, showValue: true },
    measurements: [],
  };
  return name;
}

/** Remove a probe and any lane it leaves empty. */
export function removeProbe(draft: CircuitDocument, probeId: string): void {
  const p = draft.probes[probeId];
  if (!p) return;
  delete draft.probes[probeId];
  const others = Object.values(draft.probes).some((o) => o.lane === p.lane);
  if (!others && draft.lanes.length > 1) draft.lanes = draft.lanes.filter((l) => l.id !== p.lane);
}

/** Flip a current probe's direction (PRB-06). Returns false for targets without a direction. */
export function reverseProbe(draft: CircuitDocument, probeId: string): boolean {
  const p = draft.probes[probeId];
  if (!p || p.quantity !== "current") return false;
  const t = p.target;
  if (t.kind === "through" || t.kind === "segment") {
    p.target = { ...t, reversed: !t.reversed };
    return true;
  }
  if (t.kind === "across") {
    p.target = { kind: "through", part: t.part, reversed: true };
    return true;
  }
  if (t.kind === "terminal") {
    p.target = { kind: "through", part: t.part, terminal: t.terminal, reversed: true };
    return true;
  }
  if (t.kind === "point") {
    p.target = { kind: "segment", wire: t.wire, segment: t.segment, reversed: true };
    return true;
  }
  return false;
}
