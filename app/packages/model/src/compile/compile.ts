// The netlist compiler (design/circuit-model.md §4): document -> CompiledCircuit.
import type { CompiledCircuit, IdentityMap, NetlistElement, NodeInfo, PartResolver, SegmentInfo } from "../netlist";
import type { CircuitDocument } from "../types";
import { resolveChannels } from "./channels";
import { collect } from "./collect";
import { segmentTerms } from "./currents";
import { checkCircuit } from "./diagnostics";
import { assignNodes } from "./nodes";

export function compile(doc: CircuitDocument, resolver: PartResolver, previous?: CompiledCircuit): CompiledCircuit {
  const g = collect(doc, resolver);

  const firstSource = g.elements.find((e) => e.topLevel && e.traits.voltageSource && e.keys.length >= 2);
  // One-terminal sources (rails, logic parts) are referenced to ground themselves, so with no
  // ground symbol the reference is a node of its own, as in CircuitJS1's analyzeCircuit().
  const implicitGround = g.elements.some(
    (e) => e.topLevel && e.keys.length === 1 && (e.traits.voltageSource || (e.traits.digitalPins?.length ?? 0) > 0),
  );
  const na = assignNodes(g, previous, firstSource?.keys[1], implicitGround);

  const els = g.elements.map((rec) => ({ rec, nodes: rec.keys.map((k) => na.keyToNode.get(k) ?? 0) }));
  const elements: NetlistElement[] = els.map(({ rec, nodes }) => {
    const el: NetlistElement = { id: rec.id, type: rec.part.type, nodes, props: rec.part.props };
    if (rec.part.savedState) el.savedState = rec.part.savedState;
    return el;
  });

  // Node kinds from digital pins.
  const digital = new Map<number, { d: boolean; a: boolean }>();
  for (const { rec, nodes } of els) {
    const pins = new Set(rec.traits.digitalPins ?? []);
    nodes.forEach((n, i) => {
      const k = digital.get(n) ?? { d: false, a: false };
      if (pins.has(i)) k.d = true;
      else k.a = true;
      digital.set(n, k);
    });
  }
  const nodes: NodeInfo[] = na.groups.map((grp) => {
    const k = digital.get(grp.index);
    const kind = k?.d ? (k.a ? "mixed" : "digital") : "analog";
    return { index: grp.index, name: grp.name, points: grp.points, kind };
  });

  const pointToNode = new Map<string, number>();
  for (const [key, v] of g.vertices) if (v.point) pointToNode.set(key, na.keyToNode.get(key) ?? 0);

  const terms = segmentTerms(g, na);
  const segments: SegmentInfo[] = g.segments.map((s) => ({
    wire: s.wire,
    segment: s.segment,
    from: s.from,
    to: s.to,
    node: na.keyToNode.get(s.fromKey) ?? 0,
    terms: terms.get(`${s.wire}#${s.segment}`) ?? [],
  }));

  const elementById = new Map(elements.map((e) => [e.id, e]));
  const channels = resolveChannels(doc.probes, {
    elements: elementById,
    segments: new Map(segments.map((s) => [`${s.wire}#${s.segment}`, s])),
  });

  const identity: IdentityMap = {};
  if (previous) {
    for (const old of previous.netlist.elements) if (elementById.has(old.id)) identity[old.id] = old.id;
  }

  const diagnostics = [...g.diagnostics, ...checkCircuit(g, na, els)];

  return {
    netlist: {
      nodeCount: na.groups.length - 1,
      nodeNames: na.groups.map((n) => n.name),
      elements,
      settings: doc.settings,
    },
    nodes,
    pointToNode,
    segments,
    channels,
    identity,
    diagnostics,
  };
}
