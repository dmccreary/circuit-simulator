// Probes placed inside a subcircuit (EDT-36) name their target with a path of
// instance ids, "u1/w3" or "u1/u2/r1". Parts resolve through the flattened
// element ids already; wire segments inside an instance are resolved here,
// from the vertex key the collect stage gave the segment's first point.
import { pointKey, type NodeIndex } from "../netlist";
import type { CircuitDocument, SubcircuitDefinition, Wire } from "../types";
import { SUBCIRCUIT_TYPE } from "./collect";

/** The definition an instance path leads into ("u1/u2" -> u2's definition), or undefined. */
export function definitionAt(doc: CircuitDocument, path: readonly string[]): SubcircuitDefinition | undefined {
  let parts = doc.parts;
  let def: SubcircuitDefinition | undefined;
  for (const id of path) {
    const inst = parts[id];
    if (!inst || inst.type !== SUBCIRCUIT_TYPE) return undefined;
    const defId = inst.props.definition;
    def = typeof defId === "string" ? doc.subcircuits[defId] : undefined;
    if (!def) return undefined;
    parts = def.parts;
  }
  return def;
}

/** The wire a path names ("u1/w3"), with the instance path it lives under. */
export function wireAt(doc: CircuitDocument, wirePath: string): { wire: Wire; prefix: string } | undefined {
  const parts = wirePath.split("/");
  if (parts.length < 2) return undefined;
  const id = parts.pop()!;
  const def = definitionAt(doc, parts);
  const wire = def?.wires[id];
  return wire ? { wire, prefix: parts.join("/") + "/" } : undefined;
}

/** Node lookup for wire segments inside instances, for resolveChannels. */
export function innerSegmentNodes(
  doc: CircuitDocument,
  keyToNode: ReadonlyMap<string, NodeIndex>,
): (wirePath: string, segment: number) => NodeIndex | undefined {
  return (wirePath, segment) => {
    const at = wireAt(doc, wirePath);
    const p = at?.wire.points[segment];
    return p ? keyToNode.get(at.prefix + pointKey(p)) : undefined;
  };
}
