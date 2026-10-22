/** Width and height classes from the simulator's own size, not the screen's (spec §5, app-shell.md §3.1). */
export type WidthClass = "xwide" | "wide" | "medium" | "narrow";
export type HeightClass = "normal" | "short";
export type Arrangement = "side" | "stacked" | "single";
export type MainView = "both" | "circuit" | "chart";

export interface Layout {
  width: WidthClass;
  height: HeightClass;
  pointer: "fine" | "coarse";
  arrangement: Arrangement;
}

export const BREAKPOINTS = { xwide: 1440, wide: 1024, medium: 720, short: 520 } as const;
/** LAY-10: side by side only while the schematic keeps 360 px and the chart 320 px. */
export const MIN_SCHEMATIC_PX = 360;
export const MIN_CHART_PX = 320;

export function widthClass(w: number): WidthClass {
  if (w >= BREAKPOINTS.xwide) return "xwide";
  if (w >= BREAKPOINTS.wide) return "wide";
  if (w >= BREAKPOINTS.medium) return "medium";
  return "narrow";
}

export function heightClass(h: number): HeightClass {
  return h < BREAKPOINTS.short ? "short" : "normal";
}

/**
 * Schematic and chart sit side by side in the wide classes when the center
 * region has room for both minimums; otherwise they stack, and narrow shows one.
 */
export function arrangementFor(width: WidthClass, centerWidth: number): Arrangement {
  if (width === "narrow") return "single";
  if ((width === "xwide" || width === "wide") && centerWidth >= MIN_SCHEMATIC_PX + MIN_CHART_PX) return "side";
  return "stacked";
}

export function classifyLayout(w: number, h: number, coarse: boolean, centerWidth = w): Layout {
  const width = widthClass(w);
  return { width, height: heightClass(h), pointer: coarse ? "coarse" : "fine", arrangement: arrangementFor(width, centerWidth) };
}

/** Clamp the chart's share of the center so neither side drops below its minimum (LAY-10). */
export function clampChartFrac(frac: number, arrangement: Arrangement, size: number): number {
  let lo = 0.15;
  let hi = 0.85;
  if (arrangement === "side" && size > 0) {
    lo = Math.max(lo, MIN_CHART_PX / size);
    hi = Math.min(hi, 1 - MIN_SCHEMATIC_PX / size);
  }
  if (lo > hi) return 0.4;
  return Math.min(hi, Math.max(lo, frac));
}

export const DEFAULT_SIZES = { chartFrac: 0.4, paletteW: 190, inspectorW: 230 } as const;
export const SIZE_LIMITS = { paletteW: [120, 400], inspectorW: [180, 480] } as const;
