import type { CircuitDocument, Id } from "./types";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Short random identifier, unique in practice within one document. */
export function newId(prefix = "e"): Id {
  const bytes = new Uint8Array(10);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % 36];
  // Ids must never look like array indices: object key order would then stop
  // following insertion order, which the compiler uses as "age".
  return `${prefix}_${s}`;
}

export const FORMAT_VERSION = 1;

/** An empty, valid document; `partial` overrides top-level fields. */
export function createDocument(partial: Partial<CircuitDocument> = {}): CircuitDocument {
  return {
    formatVersion: FORMAT_VERSION,
    meta: { title: "", description: "" },
    settings: { realisticParts: false, realisticRatings: false, start: "zero", seed: 1 },
    parts: {},
    wires: {},
    netLabels: {},
    annotations: {},
    probes: {},
    lanes: [],
    mathTraces: {},
    sliders: {},
    subcircuits: {},
    analyses: {},
    view: { center: { x: 0, y: 0 }, zoom: 1 },
    ...partial,
  };
}
