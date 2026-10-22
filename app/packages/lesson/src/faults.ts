// Random faults (embedding-lessons-xapi.md §4.4, LES-07): one fault per learner,
// chosen by a generator seeded from the learner and the lesson, and applied as a
// hidden overlay on the copy of the document the compiler sees.

import { createRng } from "@cs/dmath";
import type { CircuitDocument, Part, Point, PropValue } from "@cs/model";
import { amount } from "./amount";
import { findPart } from "./context";
import type { Fault } from "./types";

/** FNV-1a: a stable 32-bit number from text. */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The same learner, lesson and step always get the same fault; classmates usually differ. */
export function pickFault(faults: readonly Fault[], learnerId: string, lessonId: string, step: number): number {
  if (faults.length <= 1) return 0;
  const rng = createRng(seedFrom(`${learnerId}|${lessonId}|${step}`));
  return Math.min(faults.length - 1, Math.floor(rng.next() * faults.length));
}

/**
 * The document the compiler should see with the fault applied. The real
 * document is unchanged, so the fault cannot be undone, inspected, saved or
 * shared. "open" removes the part; "short" replaces it with a wire between
 * its first two terminals; "value" overrides props.
 */
export function applyFault(doc: CircuitDocument, fault: Fault, terminals: (p: Part) => Point[]): CircuitDocument {
  const part = findPart(doc, fault.part);
  if (!part) return doc;
  const parts = { ...doc.parts };
  const wires = { ...doc.wires };
  if (fault.kind === "open") {
    delete parts[part.id];
  } else if (fault.kind === "short") {
    const [a, b] = terminals(part);
    delete parts[part.id];
    if (a && b) {
      // An L-shaped wire: wires are made of axis-aligned segments.
      const points = a.x === b.x || a.y === b.y ? [a, b] : [a, { x: b.x, y: a.y }, b];
      wires[`fault-${part.id}`] = { id: `fault-${part.id}`, points };
    }
  } else {
    const props: Record<string, PropValue> = { ...part.props };
    for (const [k, v] of Object.entries(fault.props ?? {})) {
      props[k] = typeof v === "boolean" ? v : typeof part.props[k] === "string" ? String(v) : amount(v) ?? props[k];
    }
    parts[part.id] = { ...part, props };
  }
  return { ...doc, parts, wires };
}

/** "R2 open" for summaries and xAPI. */
export const describeFault = (f: Fault): string => `${f.part} ${f.kind === "value" ? "wrong value" : f.kind}`;
