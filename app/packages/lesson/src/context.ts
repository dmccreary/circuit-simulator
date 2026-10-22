import type { CircuitDocument, CompiledCircuit, NodeIndex, Part, Point } from "@cs/model";
import { pointKey } from "@cs/model";
import type { Quantity } from "./types";

/**
 * Read-only view of the simulator that checks are evaluated against
 * (embedding-lessons-xapi.md §4.3). The app builds it from the controller;
 * tests build it by hand.
 */
export interface LessonContext {
  doc: CircuitDocument;
  compiled?: CompiledCircuit;
  /** Terminal positions in document grid coordinates. */
  terminals(part: Part): Point[];
  /** Latest value of a part quantity, from the frame's display state. */
  partValue(partId: string, q: Quantity): number | undefined;
  /** Latest sample of a probe's channel. */
  probeValue(probeId: string): number | undefined;
  /** A chart measurement over the last `over` seconds of a probe's trace (the whole history when undefined). */
  measure(probeId: string, kind: string, over?: number): number | undefined;
  diagnostics: readonly { id: string; elements: readonly string[] }[];
  simTime: number;
  runState: string;
}

/** What makes a check's answer change, so it is re-evaluated only then (LES-08). */
export type Reason = "doc" | "frame" | "diagnostics" | "enter";

/** A part by label (preferred) or id. */
export function findPart(doc: CircuitDocument, ref: string): Part | undefined {
  return Object.values(doc.parts).find((p) => p.label === ref) ?? doc.parts[ref];
}

/** A probe by name or id. */
export function findProbe(doc: CircuitDocument, ref: string) {
  return Object.values(doc.probes).find((p) => p.name === ref) ?? doc.probes[ref];
}

/** "R1.2" -> the node of R1's second terminal; "GND" or a net label -> that node. */
export function nodeOf(ctx: Pick<LessonContext, "doc" | "compiled" | "terminals">, ref: string): NodeIndex | undefined {
  const cc = ctx.compiled;
  if (!cc) return undefined;
  const m = /^(.+)\.(\d+)$/.exec(ref);
  if (m) {
    const part = findPart(ctx.doc, m[1]);
    const pt = part ? ctx.terminals(part)[Number(m[2]) - 1] : undefined;
    if (pt) return cc.pointToNode.get(pointKey(pt));
  }
  return cc.nodes.find((n) => n.name === ref)?.index;
}

/**
 * A part quantity from a display state (layout: displayStateSize in @cs/model).
 * Values are magnitudes, so a lesson does not depend on which way a part was drawn.
 */
export function partValueFromDisplay(cc: CompiledCircuit | undefined, display: ArrayLike<number> | undefined, partId: string, q: Quantity): number | undefined {
  if (!cc || !display) return undefined;
  const els = cc.netlist.elements;
  let off = cc.netlist.nodeCount + 1;
  for (const el of els) {
    if (el.id === partId) {
      const v = (i: number) => (el.nodes[i] === 0 ? 0 : display[el.nodes[i]] ?? NaN);
      if (q === "voltage") return el.nodes.length >= 2 ? Math.abs(v(0) - v(1)) : Math.abs(v(0));
      if (q === "current") return Math.abs(display[off] ?? NaN);
      let p = 0;
      for (let i = 0; i < el.nodes.length; i++) p += v(i) * (display[off + i] ?? NaN);
      return Math.abs(p);
    }
    off += el.nodes.length;
  }
  return undefined;
}
