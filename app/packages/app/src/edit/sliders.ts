import type { CircuitDocument, Part, Slider } from "@cs/model";
import type { ElementDescriptor, PropSpec } from "@cs/elements";

/** Numeric props a slider can drive (EDT-30: any numeric property). */
export function sliderableProps(d: ElementDescriptor | undefined): PropSpec[] {
  return (d?.props ?? []).filter((p) => (p.kind ?? "number") === "number" && p.sliderable !== false);
}

/** A decade either side of the present value, inside the prop's range; logarithmic for positive values. */
export function defaultSliderRange(spec: PropSpec, value: number): { min: number; max: number; log: boolean } {
  const [lo, hi] = spec.range ?? [-Infinity, Infinity];
  if (value > 0) {
    const min = Math.max(lo, value / 10, Number.MIN_VALUE);
    const max = Math.min(hi, value * 10);
    if (max > min) return { min, max, log: min > 0 };
  }
  const span = Math.max(1, Math.abs(value)) * 10;
  const min = Math.max(lo, value - span);
  const max = Math.min(hi, value + span);
  return { min, max: max > min ? max : min + 1, log: false };
}

/** Slider position 0..1 to a value, and back. */
export function sliderValue(s: Pick<Slider, "min" | "max" | "log">, pos: number): number {
  const f = Math.min(1, Math.max(0, pos));
  if (s.log && s.min > 0 && s.max > 0) return s.min * Math.pow(s.max / s.min, f);
  return s.min + (s.max - s.min) * f;
}

export function sliderPosition(s: Pick<Slider, "min" | "max" | "log">, v: number): number {
  if (s.log && s.min > 0 && s.max > 0 && v > 0) return Math.min(1, Math.max(0, Math.log(v / s.min) / Math.log(s.max / s.min)));
  return s.max === s.min ? 0 : Math.min(1, Math.max(0, (v - s.min) / (s.max - s.min)));
}

/** Add a slider for part.prop unless one exists. Returns its id. */
export function addSlider(draft: CircuitDocument, id: string, part: Part, spec: PropSpec): string {
  const existing = Object.values(draft.sliders).find((s) => s.part === part.id && s.prop === spec.key);
  if (existing) return existing.id;
  const v = part.props[spec.key];
  const r = defaultSliderRange(spec, typeof v === "number" ? v : Number(spec.default) || 0);
  draft.sliders[id] = { id, part: part.id, prop: spec.key, min: r.min, max: r.max, ...(r.log ? { log: true } : {}) };
  return id;
}
