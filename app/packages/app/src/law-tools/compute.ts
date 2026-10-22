// Kirchhoff's laws made visible (PRB-16, PRB-18; history-and-analysis.md
// §4.3): the voltage steps around a loop of nodes and the branch currents at
// a node, computed from one display state.

import type { CompiledCircuit, ProbeTarget } from "@cs/model";
import { indexOf, nodeVoltage, segmentOf, terminalCurrent, type LiveSource } from "../probes/evaluate";

/** The node a node-like target (terminal or wire point) is on. */
export function nodeOfTarget(cc: CompiledCircuit, t: ProbeTarget): number | undefined {
  if (t.kind === "terminal") return indexOf(cc).element.get(t.part)?.el.nodes[t.terminal];
  if (t.kind === "point" || t.kind === "segment") return segmentOf(cc, t.wire, t.segment)?.node;
  return undefined;
}

export interface LoopStep {
  from: number;
  to: number;
  /** The part between the two nodes, if one joins them directly. */
  element?: string;
  /** V(to) − V(from): positive is a rise. */
  rise: number;
}

export interface LoopResult {
  steps: LoopStep[];
  /** Running total after each step. */
  totals: number[];
  closed: boolean;
  sum: number;
}

/** An element with one terminal on `a` and another on `b`, preferring two-terminal parts. */
export function elementBetween(cc: CompiledCircuit, a: number, b: number, exclude?: Set<string>): string | undefined {
  let best: { id: string; n: number } | undefined;
  for (const el of cc.netlist.elements) {
    if (exclude?.has(el.id)) continue;
    if (el.nodes.includes(a) && el.nodes.includes(b) && a !== b && (!best || el.nodes.length < best.n)) best = { id: el.id, n: el.nodes.length };
  }
  return best?.id;
}

/**
 * Steps around a sequence of nodes. A loop is closed when the last node is
 * the first; its sum is then Kirchhoff's voltage law's zero.
 */
export function loopSteps(src: LiveSource, nodes: number[]): LoopResult {
  const steps: LoopStep[] = [];
  const totals: number[] = [];
  const used = new Set<string>();
  let total = 0;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    const element = elementBetween(src.compiled, from, to, used);
    if (element) used.add(element);
    const rise = nodeVoltage(src, to) - nodeVoltage(src, from);
    total += rise;
    steps.push({ from, to, element, rise });
    totals.push(total);
  }
  const closed = nodes.length > 2 && nodes[0] === nodes[nodes.length - 1];
  return { steps, totals, closed, sum: total };
}

export interface Branch {
  element: string;
  terminal: number;
  /** Current leaving the node into this terminal, amps (negative: entering the node). */
  leaving: number;
}

export interface JunctionResult {
  node: number;
  branches: Branch[];
  /** Sum of currents leaving the node: Kirchhoff's current law's zero. */
  sum: number;
}

/** Every element terminal on a node and the current it draws from the node. */
export function junctionCurrents(src: LiveSource, node: number): JunctionResult {
  const branches: Branch[] = [];
  let sum = 0;
  for (const el of src.compiled.netlist.elements) {
    el.nodes.forEach((n, k) => {
      if (n !== node) return;
      const i = terminalCurrent(src, el.id, k) ?? 0;
      branches.push({ element: el.id, terminal: k, leaving: i });
      sum += i;
    });
  }
  return { node, branches, sum };
}
