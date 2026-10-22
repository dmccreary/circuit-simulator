// Document operations on subcircuit definitions (circuit-model.md §6):
// edit one copy or all (EDT-38), seal (EDT-37), keep instance blocks in step
// with their definition's pins, and bundle a definition with the ones it uses.

import type { CircuitDocument, Id, Part, SubcircuitDefinition } from "../types";
import { decodeLayout, defaultLayout, encodeLayout } from "./layout";
import { SUBCIRCUIT_TYPE } from "./make";

export const definitionOf = (part: Part | undefined): string | undefined =>
  part?.type === SUBCIRCUIT_TYPE && typeof part.props.definition === "string" ? part.props.definition : undefined;

/** Every instance of a definition, at the top level and inside other definitions. */
export function instancesOf(doc: CircuitDocument, defId: Id): { sheet: Id | null; part: Part }[] {
  const out: { sheet: Id | null; part: Part }[] = [];
  for (const p of Object.values(doc.parts)) if (definitionOf(p) === defId) out.push({ sheet: null, part: p });
  for (const def of Object.values(doc.subcircuits))
    for (const p of Object.values(def.parts)) if (definitionOf(p) === defId) out.push({ sheet: def.id, part: p });
  return out;
}

/** The parts collection an instance lives in (top level or a definition). */
function sheetParts(d: CircuitDocument, sheet: Id | null): Record<Id, Part> | undefined {
  return sheet === null ? d.parts : d.subcircuits[sheet]?.parts;
}

/**
 * "Edit this one" (EDT-38): copy the instance's definition under a new id and
 * point only this instance at the copy. Returns the copy's id.
 */
export function separateInstance(d: CircuitDocument, sheet: Id | null, instanceId: Id, newId: (prefix: string) => Id): Id | undefined {
  const part = sheetParts(d, sheet)?.[instanceId];
  const defId = definitionOf(part);
  const def = defId ? d.subcircuits[defId] : undefined;
  if (!part || !def) return undefined;
  const copyId = newId("sc");
  const copy: SubcircuitDefinition = JSON.parse(JSON.stringify(def));
  copy.id = copyId;
  delete copy.readOnly;
  d.subcircuits[copyId] = copy;
  part.props.definition = copyId;
  return copyId;
}

/**
 * Re-derive every instance's block after the definition's pins changed. An
 * instance keeps its own layout (an imported Falstad block) while the pin
 * names and sides still match it.
 */
export function syncInstances(d: CircuitDocument, defId: Id): void {
  const def = d.subcircuits[defId];
  if (!def) return;
  const fresh = encodeLayout(defaultLayout(def.pins));
  for (const { sheet, part } of instancesOf(d, defId)) {
    const target = sheetParts(d, sheet)?.[part.id];
    if (!target) continue;
    const cur = decodeLayout(target.props.pinLayout);
    const same = cur.pins.length === def.pins.length && cur.pins.every((p, i) => p.name === def.pins[i].name && p.side === def.pins[i].side);
    if (!same && target.props.pinLayout !== fresh) target.props.pinLayout = fresh;
  }
}

export function setSealed(d: CircuitDocument, defId: Id, sealed: boolean): void {
  const def = d.subcircuits[defId];
  if (!def) return;
  if (sealed) def.sealed = true;
  else delete def.sealed;
}

/** A definition plus every definition it uses, for My parts and pasting. */
export interface DefinitionBundle {
  root: Id;
  definitions: Record<Id, SubcircuitDefinition>;
}

export function bundleDefinition(doc: CircuitDocument, defId: Id): DefinitionBundle | undefined {
  if (!doc.subcircuits[defId]) return undefined;
  const definitions: Record<Id, SubcircuitDefinition> = {};
  const visit = (id: Id) => {
    const def = doc.subcircuits[id];
    if (!def || definitions[id]) return;
    definitions[id] = JSON.parse(JSON.stringify(def));
    for (const p of Object.values(def.parts)) {
      const inner = definitionOf(p);
      if (inner) visit(inner);
    }
  };
  visit(defId);
  return { root: defId, definitions };
}

/** Add a bundle's definitions that the document does not already have. */
export function insertBundle(d: CircuitDocument, b: DefinitionBundle): void {
  for (const [id, def] of Object.entries(b.definitions)) if (!d.subcircuits[id]) d.subcircuits[id] = JSON.parse(JSON.stringify(def));
}

/** A new instance part for a definition, with its block layout. */
export function instancePart(def: SubcircuitDefinition, id: Id, label: string, at: { x: number; y: number }): Part {
  return {
    id,
    type: SUBCIRCUIT_TYPE,
    label,
    at: { x: at.x, y: at.y },
    orientation: { rot: 0, flip: false },
    props: { definition: def.id, pinLayout: encodeLayout(defaultLayout(def.pins)) },
  };
}

/** Definitions no instance refers to any more. */
export function unusedDefinitions(doc: CircuitDocument): Id[] {
  const used = new Set<Id>();
  const visit = (parts: Record<Id, Part>) => {
    for (const p of Object.values(parts)) {
      const id = definitionOf(p);
      if (id && !used.has(id) && doc.subcircuits[id]) {
        used.add(id);
        visit(doc.subcircuits[id].parts);
      }
    }
  };
  visit(doc.parts);
  return Object.keys(doc.subcircuits).filter((id) => !used.has(id));
}
