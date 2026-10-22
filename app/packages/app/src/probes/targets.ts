// What a probe click measures (spec §13.1): the target for each quantity
// from a hit, the terminal nearest the click on multi-terminal parts
// (PRB-07), and the default direction of a new current probe (PRB-06).

import type { CompiledCircuit, Point, ProbeTarget } from "@cs/model";
import type { HitTarget } from "@cs/render";
import type { Quantity } from "./add";
import { indexOf, segmentCurrent, segmentOf, type LiveSource } from "./evaluate";

export interface TargetContext {
  terminals(partId: string): Point[];
  compiled?: CompiledCircuit;
  display?: ArrayLike<number>;
}

const dist2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function nearestTerminal(terms: Point[], at: Point): number {
  let best = 0;
  terms.forEach((p, i) => {
    if (dist2(p, at) < dist2(terms[best], at)) best = i;
  });
  return best;
}

/** A point on a wire segment, at the fraction nearest `at` (rounded to 0.01). */
export function pointOnSegment(t: Extract<HitTarget, { kind: "segment" }>, at: Point): ProbeTarget {
  const dx = t.to.x - t.from.x;
  const dy = t.to.y - t.from.y;
  const len2 = dx * dx + dy * dy;
  const proj = len2 === 0 ? 0 : ((at.x - t.from.x) * dx + (at.y - t.from.y) * dy) / len2;
  const f = Math.round(proj * 100) / 100;
  return { kind: "point", wire: t.wire, segment: t.segment, t: Math.min(1, Math.max(0, f)) };
}

/** A node-like target (point or terminal) for one lead of a voltage probe. */
export function nodeTarget(t: HitTarget, at: Point, ctx: TargetContext): ProbeTarget | undefined {
  if (t.kind === "terminal") return { kind: "terminal", part: t.part, terminal: t.terminal };
  if (t.kind === "segment") return pointOnSegment(t, at);
  const terms = ctx.terminals(t.part);
  if (terms.length === 0) return undefined;
  return { kind: "terminal", part: t.part, terminal: nearestTerminal(terms, at) };
}

/** True when the node under a node-like target is digital (the voltage tool then places a logic probe). */
export function isDigitalTarget(t: ProbeTarget, cc: CompiledCircuit | undefined): boolean {
  if (!cc) return false;
  let node: number | undefined;
  if (t.kind === "terminal") node = indexOf(cc).element.get(t.part)?.el.nodes[t.terminal];
  else if (t.kind === "point" || t.kind === "segment") node = segmentOf(cc, t.wire, t.segment)?.node;
  return node !== undefined && cc.nodes[node]?.kind === "digital";
}

/** The probe a click makes for a quantity, or undefined when that quantity cannot be measured there. */
export function targetFor(q: Quantity, t: HitTarget, at: Point, ctx: TargetContext): { quantity: Quantity; target: ProbeTarget } | undefined {
  switch (q) {
    case "voltage":
    case "logic": {
      let target: ProbeTarget | undefined;
      if (t.kind === "part" || t.kind === "control") {
        const n = ctx.terminals(t.part).length;
        target = n === 2 ? { kind: "across", part: t.part } : nodeTarget(t, at, ctx);
      } else target = nodeTarget(t, at, ctx);
      if (!target) return undefined;
      return { quantity: target.kind !== "across" && isDigitalTarget(target, ctx.compiled) ? "logic" : "voltage", target };
    }
    case "current": {
      if (t.kind === "segment") {
        // PRB-06: the arrow starts along the present conventional current.
        const seg = ctx.compiled && segmentOf(ctx.compiled, t.wire, t.segment);
        const src = ctx.compiled && ctx.display ? ({ compiled: ctx.compiled, display: ctx.display } as LiveSource) : undefined;
        const i = seg && src ? segmentCurrent(src, seg) : 0;
        return { quantity: "current", target: { kind: "segment", wire: t.wire, segment: t.segment, reversed: i < -1e-15 } };
      }
      const terms = ctx.terminals(t.part);
      if (terms.length === 0) return undefined;
      // PRB-07: three or more terminals measure the one nearest the click.
      const terminal = t.kind === "terminal" ? t.terminal : terms.length >= 3 ? nearestTerminal(terms, at) : undefined;
      return { quantity: "current", target: { kind: "through", part: t.part, ...(terminal !== undefined ? { terminal } : {}), reversed: false } };
    }
    case "power":
      if (t.kind === "segment") return undefined;
      return { quantity: "power", target: { kind: "across", part: t.part } };
  }
}

/** The part or wire a target belongs to (for "Probe I2 removed with R3", PRB-12). */
export function targetOwners(t: ProbeTarget): { parts: string[]; wires: string[] } {
  switch (t.kind) {
    case "terminal":
    case "across":
    case "through":
      return { parts: [t.part], wires: [] };
    case "point":
    case "segment":
      return { parts: [], wires: [t.wire] };
    case "between": {
      const a = targetOwners(t.a);
      const b = targetOwners(t.b);
      return { parts: [...a.parts, ...b.parts], wires: [...a.wires, ...b.wires] };
    }
  }
}
