// Live values of probes, parts, nodes and wire segments, read on the main
// thread from a frame's display state (node voltages, then the current into
// every element terminal; see displayStateSize() in @cs/model).

import type { ChannelSpec, CompiledCircuit, NetlistElement, Probe, ProbeTarget, SegmentInfo } from "@cs/model";
import { resolveChannels, terminalCurrentOffsets } from "@cs/model";

/** A compiled circuit and one display state from it. */
export interface LiveSource {
  compiled: CompiledCircuit;
  display: ArrayLike<number>;
}

interface Index {
  element: Map<string, { i: number; el: NetlistElement; base: number }>;
  segment: Map<string, SegmentInfo>;
}

const indexes = new WeakMap<CompiledCircuit, Index>();

/** Lookup tables per compiled circuit, built once. */
export function indexOf(cc: CompiledCircuit): Index {
  let ix = indexes.get(cc);
  if (!ix) {
    const offs = terminalCurrentOffsets(cc.netlist);
    const base = cc.netlist.nodeCount + 1;
    ix = {
      element: new Map(cc.netlist.elements.map((el, i) => [el.id, { i, el, base: base + offs[i] }])),
      segment: new Map(cc.segments.map((s) => [`${s.wire}#${s.segment}`, s])),
    };
    indexes.set(cc, ix);
  }
  return ix;
}

export function segmentOf(cc: CompiledCircuit, wire: string, segment: number): SegmentInfo | undefined {
  return indexOf(cc).segment.get(`${wire}#${segment}`);
}

export function nodeVoltage(src: LiveSource, node: number): number {
  return node <= 0 ? 0 : (src.display[node] ?? NaN);
}

/** Current INTO a terminal of an element, amps. */
export function terminalCurrent(src: LiveSource, element: string, terminal: number): number | undefined {
  const e = indexOf(src.compiled).element.get(element);
  if (!e || terminal < 0 || terminal >= e.el.nodes.length) return undefined;
  return src.display[e.base + terminal];
}

/** Current along a wire segment from its `from` end to its `to` end (sum of signed terminal currents). */
export function segmentCurrent(src: LiveSource, seg: SegmentInfo): number {
  let sum = 0;
  for (const t of seg.terms) sum += t.sign * (terminalCurrent(src, t.element, t.terminal) ?? 0);
  return sum;
}

/** Absorbed power of an element: sum of V·I over its terminals. */
export function elementPower(src: LiveSource, element: string): number | undefined {
  const e = indexOf(src.compiled).element.get(element);
  if (!e) return undefined;
  let p = 0;
  e.el.nodes.forEach((n, k) => (p += nodeVoltage(src, n) * (src.display[e.base + k] ?? 0)));
  return p;
}

/** A channel's value from the display state, as the engine would record it. */
export function channelValue(src: LiveSource, spec: ChannelSpec): number | undefined {
  switch (spec.kind) {
    case "voltage":
      return nodeVoltage(src, spec.a) - nodeVoltage(src, spec.b);
    case "current":
      return terminalCurrent(src, spec.element, spec.terminal);
    case "power":
      return elementPower(src, spec.element);
    case "logic":
      return nodeVoltage(src, spec.node) >= 2.5 ? 1 : 0;
  }
}

/** The channel a probe (or a probe not yet placed) resolves to, or undefined. */
export function resolveProbe(cc: CompiledCircuit, probe: Pick<Probe, "id" | "quantity" | "target">): ChannelSpec | undefined {
  const ix = indexOf(cc);
  const full = { name: "", style: { color: "", width: 1 }, lane: "", flag: { offset: { x: 0, y: 0 }, showValue: false }, measurements: [], ...probe } as Probe;
  return resolveChannels({ [probe.id]: full }, { elements: new Map([...ix.element].map(([k, v]) => [k, v.el])), segments: ix.segment })[probe.id];
}

/**
 * Terms of a current that no single-terminal channel can express: a wire
 * segment between two junctions (a sum of terminal currents), or a reversed
 * terminal of a part with three or more terminals (ChannelSpec current has no
 * sign). Undefined for other targets.
 */
export function segmentSumTerms(cc: CompiledCircuit, t: ProbeTarget): { terms: SegmentInfo["terms"]; reversed: boolean } | undefined {
  if (t.kind === "through" && t.reversed) {
    const e = indexOf(cc).element.get(t.part);
    const k = t.terminal ?? 0;
    if (!e || e.el.nodes.length < 3 || k >= e.el.nodes.length) return undefined;
    return { terms: [{ element: t.part, terminal: k, sign: 1 }], reversed: true };
  }
  if (t.kind !== "segment" && t.kind !== "point") return undefined;
  const seg = segmentOf(cc, t.wire, t.segment);
  if (!seg || seg.terms.length === 1) return undefined;
  return { terms: seg.terms, reversed: t.kind === "segment" && t.reversed };
}

/** A probe's present value: its resolved channel, or a summed segment current. */
export function probeValue(src: LiveSource, probe: Pick<Probe, "id" | "quantity" | "target">): number | undefined {
  const cc = src.compiled;
  const spec = cc.channels[probe.id] ?? resolveProbe(cc, probe);
  if (spec) return channelValue(src, spec);
  if (probe.quantity !== "current") return undefined;
  const sum = segmentSumTerms(cc, probe.target);
  if (!sum) return undefined;
  let v = 0;
  for (const term of sum.terms) v += term.sign * (terminalCurrent(src, term.element, term.terminal) ?? 0);
  return sum.reversed ? -v : v;
}
