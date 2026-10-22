import type { CircuitDocument, ProbeTarget } from "@cs/model";
import type { HitTarget } from "@cs/render";
import type { CanvasPointer, Tool, ToolContext } from "./types";

export function probeTargetFor(t: HitTarget, at: { x: number; y: number }): ProbeTarget | undefined {
  switch (t.kind) {
    case "terminal":
      return { kind: "terminal", part: t.part, terminal: t.terminal };
    case "part":
    case "control":
      return { kind: "across", part: t.part };
    case "segment": {
      const dx = t.to.x - t.from.x;
      const dy = t.to.y - t.from.y;
      const len2 = dx * dx + dy * dy;
      const proj = len2 === 0 ? 0 : ((at.x - t.from.x) * dx + (at.y - t.from.y) * dy) / len2;
      const f = Math.round(proj * 100) / 100;
      return { kind: "point", wire: t.wire, segment: t.segment, t: Math.min(1, Math.max(0, f)) };
    }
  }
}

/** Add a voltage probe and put it on the first analog lane (creating one if needed). */
export function addVoltageProbe(draft: CircuitDocument, target: ProbeTarget, probeId: string, laneId: string): void {
  let lane = draft.lanes.find((l) => l.kind === "analog");
  if (!lane) {
    lane = { id: laneId, kind: "analog", yScale: { mode: "auto" } };
    draft.lanes.push(lane);
  }
  const n = Object.keys(draft.probes).length + 1;
  draft.probes[probeId] = {
    id: probeId,
    name: `V${n}`,
    quantity: "voltage",
    target,
    style: { color: `probe.${n}`, width: 1.5 },
    lane: lane.id,
    flag: { offset: { x: 1, y: -2 }, showValue: true },
    measurements: [],
  };
}

/** Voltage probe tool: one click places a probe (PRB-01). */
export class ProbeTool implements Tool {
  readonly id = "probe-v" as const;

  cursor(): string {
    return "crosshair";
  }

  onPointerMove(e: CanvasPointer, ctx: ToolContext): void {
    ctx.setHover(ctx.hit(e)[0]);
    ctx.invalidateOverlay();
  }

  onPointerDown(e: CanvasPointer, ctx: ToolContext): void {
    const hit = ctx.hit(e)[0];
    if (!hit) return;
    const target = probeTargetFor(hit.target, ctx.view.toGrid(e));
    if (!target) return;
    const id = ctx.newId("pr");
    const laneId = ctx.newId("ln");
    const tx = ctx.begin({ key: "probe.add" });
    tx.update((d) => addVoltageProbe(d, target, id, laneId));
    tx.commit();
    ctx.setHover(undefined);
    ctx.setTool({ id: "select" });
  }
}
