// Document edits for lanes and probe measurements (CHT-01–04, CHT-13, CHT-30).
// Each is a recipe for EditSystem.edit, so it becomes one undo step.

import type { CircuitDocument, Lane } from "@cs/model";

export function addLane(d: CircuitDocument, id: string, kind: Lane["kind"] = "analog"): void {
  d.lanes.push({ id, kind, yScale: { mode: "auto" } });
}

/** Remove a lane; its probes move to the nearest remaining lane. The last lane stays. */
export function removeLane(d: CircuitDocument, laneId: string): void {
  const i = d.lanes.findIndex((l) => l.id === laneId);
  if (i < 0 || d.lanes.length <= 1) return;
  d.lanes.splice(i, 1);
  const target = d.lanes[Math.max(0, i - 1)].id;
  for (const p of Object.values(d.probes)) if (p.lane === laneId) p.lane = target;
}

/** Move a lane up (-1) or down (+1). */
export function moveLane(d: CircuitDocument, laneId: string, by: -1 | 1): void {
  const i = d.lanes.findIndex((l) => l.id === laneId);
  const j = i + by;
  if (i < 0 || j < 0 || j >= d.lanes.length) return;
  const [lane] = d.lanes.splice(i, 1);
  d.lanes.splice(j, 0, lane);
}

export function setLaneKind(d: CircuitDocument, laneId: string, kind: Lane["kind"]): void {
  const lane = d.lanes.find((l) => l.id === laneId);
  if (lane) lane.kind = kind;
}

/** Auto range, or a fixed min/max that locks the lane until Auto (CHT-12, CHT-13). */
export function setLaneScale(d: CircuitDocument, laneId: string, scale: NonNullable<Lane["yScale"]>): void {
  const lane = d.lanes.find((l) => l.id === laneId);
  if (!lane) return;
  if (scale.mode === "fixed" && !(scale.min !== undefined && scale.max !== undefined && scale.max > scale.min)) return;
  lane.yScale = scale.mode === "auto" ? { mode: "auto" } : { mode: "fixed", min: scale.min, max: scale.max };
}

export function setLaneHeights(d: CircuitDocument, heights: readonly number[]): void {
  d.lanes.forEach((l, i) => {
    const h = heights[i];
    if (h !== undefined && Number.isFinite(h) && h > 0) l.height = Math.round(h);
  });
}

/** Put a probe on a lane; `newLaneId` creates that lane first when it does not exist. */
export function moveProbeToLane(d: CircuitDocument, probeId: string, laneId: string, newKind: Lane["kind"] = "analog"): void {
  const p = d.probes[probeId];
  if (!p) return;
  if (!d.lanes.some((l) => l.id === laneId)) addLane(d, laneId, newKind);
  p.lane = laneId;
}

export function addMeasurement(d: CircuitDocument, probeId: string, kind: string): void {
  const p = d.probes[probeId];
  if (!p || p.measurements.some((m) => m.kind === kind)) return;
  p.measurements.push({ kind });
}

export function removeMeasurement(d: CircuitDocument, probeId: string, kind: string): void {
  const p = d.probes[probeId];
  if (!p) return;
  const i = p.measurements.findIndex((m) => m.kind === kind);
  if (i >= 0) p.measurements.splice(i, 1);
}
