import type { CircuitDocument, CircuitSettings, Lane, MessageRef, Probe } from "@cs/model";

/** The native file format version this build writes (files-and-persistence.md §2.3). */
export const CURRENT_FORMAT_VERSION = 1;

export const defaultSettings = (): CircuitSettings => ({
  realisticParts: false,
  realisticRatings: false,
  start: "zero",
  seed: 1,
});

export function emptyDocument(title = ""): CircuitDocument {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: { title, description: "" },
    settings: defaultSettings(),
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
  };
}

/** A probe with every optional-looking field filled, so short hand-written files still load. */
export function makeProbe(
  p: Pick<Probe, "id" | "name" | "quantity" | "target" | "lane"> & Partial<Probe>,
  index = 0,
): Probe {
  return {
    ...p,
    style: p.style ?? { color: `probe.${(index % 8) + 1}`, width: 2 },
    flag: p.flag ?? { offset: { x: 1, y: -1 }, showValue: false },
    measurements: p.measurements ?? [],
  };
}

export function makeLane(id: string, kind: Lane["kind"] = "analog"): Lane {
  return { id, kind };
}

/** Thrown when a text cannot be read as a circuit at all. */
export class FormatError extends Error {
  readonly ref: MessageRef;
  constructor(ref: MessageRef) {
    super(ref.key);
    this.ref = ref;
    this.name = "FormatError";
  }
}
