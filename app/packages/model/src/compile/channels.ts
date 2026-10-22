// Stage 7: resolve probe targets (places) to engine channels.
import type { ChannelSpec, NetlistElement, NodeIndex, SegmentInfo } from "../netlist";
import type { Probe, ProbeTarget } from "../types";

export interface ChannelContext {
  elements: Map<string, NetlistElement>;
  /** Node per top-level wire segment, "wire#segment". */
  segments: Map<string, SegmentInfo>;
  /** Node of a wire segment inside a subcircuit instance ("u1/w3"); see subcircuit-probes.ts. */
  innerSegment?: (wirePath: string, segment: number) => NodeIndex | undefined;
  /** Terminal nodes of a part that is not in the netlist (a voltage readout, a ground symbol). */
  partNodes?: (part: string) => NodeIndex[] | undefined;
}

/** Terminal nodes of a probed part, whether or not it has an engine model. */
function terminalNodes(part: string, ctx: ChannelContext): NodeIndex[] | undefined {
  return ctx.elements.get(part)?.nodes ?? ctx.partNodes?.(part);
}

export function resolveChannels(probes: Record<string, Probe>, ctx: ChannelContext): Record<string, ChannelSpec> {
  const out: Record<string, ChannelSpec> = {};
  for (const probe of Object.values(probes)) {
    const ch = resolveProbe(probe, ctx);
    if (ch) out[probe.id] = ch;
  }
  return out;
}

function resolveProbe(probe: Probe, ctx: ChannelContext): ChannelSpec | undefined {
  const id = probe.id;
  const t = probe.target;
  switch (probe.quantity) {
    case "voltage": {
      const pair = nodePair(t, ctx);
      return pair && { id, kind: "voltage", a: pair[0], b: pair[1] };
    }
    case "logic": {
      const pair = nodePair(t, ctx);
      return pair && { id, kind: "logic", node: pair[0] };
    }
    case "power": {
      const el = partOf(t);
      return el !== undefined && ctx.elements.has(el) ? { id, kind: "power", element: el } : undefined;
    }
    case "current":
      return currentChannel(id, t, ctx);
  }
}

function partOf(t: ProbeTarget): string | undefined {
  if (t.kind === "terminal" || t.kind === "across" || t.kind === "through") return t.part;
  return undefined;
}

function nodeOf(t: ProbeTarget, ctx: ChannelContext): NodeIndex | undefined {
  switch (t.kind) {
    case "point":
    case "segment":
      return ctx.segments.get(`${t.wire}#${t.segment}`)?.node ?? ctx.innerSegment?.(t.wire, t.segment);
    case "terminal":
      return terminalNodes(t.part, ctx)?.[t.terminal];
    case "across":
    case "through":
      return terminalNodes(t.part, ctx)?.[0];
    case "between":
      return nodeOf(t.a, ctx);
  }
}

function nodePair(t: ProbeTarget, ctx: ChannelContext): [NodeIndex, NodeIndex] | undefined {
  if (t.kind === "between") {
    const a = nodeOf(t.a, ctx);
    const b = nodeOf(t.b, ctx);
    return a === undefined || b === undefined ? undefined : [a, b];
  }
  if (t.kind === "across" || t.kind === "through") {
    const nodes = terminalNodes(t.part, ctx);
    if (!nodes || nodes.length === 0) return undefined;
    // A one-terminal part (rail, voltage readout): its voltage to ground, as Falstad's scope shows.
    return nodes.length === 1 ? [nodes[0], 0] : [nodes[0], nodes[1]];
  }
  const n = nodeOf(t, ctx);
  return n === undefined ? undefined : [n, 0];
}

/**
 * ChannelSpec current has no sign, so a reversed reading of a two-terminal
 * part uses its other terminal (current into t1 = -current into t0).
 */
function currentChannel(id: string, t: ProbeTarget, ctx: ChannelContext): ChannelSpec | undefined {
  const into = (element: string, terminal: number, negate: boolean): ChannelSpec | undefined => {
    const el = ctx.elements.get(element);
    if (!el || terminal >= el.nodes.length) return undefined;
    if (negate) {
      if (el.nodes.length !== 2) return undefined;
      terminal = 1 - terminal;
    }
    return { id, kind: "current", element, terminal };
  };
  switch (t.kind) {
    case "terminal":
      return into(t.part, t.terminal, false);
    case "across":
      return into(t.part, 0, false);
    case "through":
      return into(t.part, t.terminal ?? 0, t.reversed);
    case "point":
    case "segment": {
      // Only expressible when the segment current is a single terminal current.
      const seg = ctx.segments.get(`${t.wire}#${t.segment}`);
      if (!seg || seg.terms.length !== 1) return undefined;
      const term = seg.terms[0];
      const reversed = t.kind === "segment" && t.reversed;
      return into(term.element, term.terminal, (term.sign === -1) !== reversed);
    }
    case "between":
      return undefined;
  }
}
