// Document lanes and probes -> chart lanes (CHT-01–04).

import type { CircuitDocument, Probe } from "@cs/model";
import { probeColor, type ChartLane, type ChartTrace, type Theme } from "@cs/render";

/** A kept trace (CHT-17): a history-store ghost of one probe's channel. */
export interface GhostEntry {
  id: string;
  probeId: string;
  label: string;
}

const UNITS: Record<Probe["quantity"], string> = { voltage: "V", current: "A", power: "W", logic: "" };

export const probeUnit = (p: Probe): string => UNITS[p.quantity] ?? "V";

/** Probes in a lane, in document order. */
export function probesInLane(doc: CircuitDocument, laneId: string): Probe[] {
  return Object.values(doc.probes).filter((p) => p.lane === laneId);
}

export function buildChartLanes(
  doc: CircuitDocument,
  channelId: (probeId: string) => string,
  theme: Theme,
  ghosts: readonly GhostEntry[] = [],
): ChartLane[] {
  return doc.lanes.map((lane) => {
    const probes = probesInLane(doc, lane.id);
    const traces: ChartTrace[] = probes.map((p) => ({
      channelId: channelId(p.id),
      name: p.name,
      color: probeColor(theme, p.style.color),
      unit: probeUnit(p),
    }));
    for (const g of ghosts) {
      const p = doc.probes[g.probeId];
      if (!p || p.lane !== lane.id) continue;
      traces.push({ channelId: g.id, name: g.label, color: probeColor(theme, p.style.color), unit: probeUnit(p), ghost: true });
    }
    const first = probes[0];
    return {
      id: lane.id,
      kind: lane.kind,
      unit: first ? probeUnit(first) : lane.kind === "logic" ? "" : "V",
      traces,
      height: lane.height,
      yScale: lane.yScale,
    };
  });
}
