import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useShell, useShellUi } from "./use-shell";
import { clampChartFrac, DEFAULT_SIZES, SIZE_LIMITS } from "./classify";
import { t } from "../messages";
import type { LearnerSettings } from "../settings/learner";
import { useStore } from "../store";

type Which = "chart" | "palette" | "inspector";
const LABEL: Record<Which, string> = { chart: "layout.splitChart", palette: "layout.splitPalette", inspector: "layout.splitInspector" };
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/**
 * A focusable separator (LAY-09): drag, arrow keys, Home/End, and
 * double-click to reset. Sizes go to learner settings (remembered per browser).
 */
export function Splitter({ which }: { which: Which }) {
  const sh = useShell();
  const ref = useRef<HTMLDivElement>(null);
  const arrangement = useShellUi((s) => s.layout?.arrangement ?? "stacked");
  const layout = useStore(sh.settings.store, (s: LearnerSettings) => s.layout);
  const vertical = which !== "chart" || arrangement === "side"; // a vertical bar resizes widths
  const set = (patch: LearnerSettings["layout"]) => sh.settings.updateLayout(patch);

  const chartSize = () => {
    const parent = ref.current?.parentElement?.getBoundingClientRect();
    return parent ? (vertical ? parent.width : parent.height) : 0;
  };
  const setChart = (frac: number) => set({ chartFrac: Math.round(clampChartFrac(frac, arrangement, chartSize()) * 1000) / 1000 });

  const fromPointer = (e: PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    if (which === "chart") {
      const r = el.parentElement!.getBoundingClientRect();
      setChart(vertical ? (r.right - e.clientX) / r.width : (r.bottom - e.clientY) / r.height);
    } else if (which === "palette") {
      const left = (el.previousElementSibling as HTMLElement | null)?.getBoundingClientRect().left ?? 0;
      set({ paletteW: clamp(e.clientX - left, SIZE_LIMITS.paletteW) });
    } else {
      const right = (el.nextElementSibling as HTMLElement | null)?.getBoundingClientRect().right ?? window.innerWidth;
      set({ inspectorW: clamp(right - e.clientX, SIZE_LIMITS.inspectorW) });
    }
  };

  const reset = () => {
    if (which === "chart") set({ chartFrac: DEFAULT_SIZES.chartFrac });
    else if (which === "palette") set({ paletteW: DEFAULT_SIZES.paletteW });
    else set({ inspectorW: DEFAULT_SIZES.inspectorW });
  };

  const onKey = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 5 : 1;
    const grow: Record<string, number> = vertical ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowDown: 1, ArrowUp: -1 };
    const d = grow[e.key];
    if (which === "chart") {
      const frac = layout.chartFrac ?? DEFAULT_SIZES.chartFrac;
      // Moving the bar right/down grows the schematic, so the chart shrinks.
      if (d) setChart(frac - d * 0.02 * big);
      else if (e.key === "Home") setChart(0.85);
      else if (e.key === "End") setChart(0.15);
      else if (e.key === "Enter") reset();
      else return;
    } else {
      const key = which === "palette" ? "paletteW" : "inspectorW";
      const cur = layout[key] ?? DEFAULT_SIZES[key];
      const sign = which === "palette" ? 1 : -1;
      if (d) set({ [key]: clamp(cur + sign * d * 10 * big, SIZE_LIMITS[key]) });
      else if (e.key === "Home") set({ [key]: SIZE_LIMITS[key][0] });
      else if (e.key === "End") set({ [key]: SIZE_LIMITS[key][1] });
      else if (e.key === "Enter") reset();
      else return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const value =
    which === "chart"
      ? Math.round((1 - (layout.chartFrac ?? DEFAULT_SIZES.chartFrac)) * 100)
      : Math.round(which === "palette" ? (layout.paletteW ?? DEFAULT_SIZES.paletteW) : (layout.inspectorW ?? DEFAULT_SIZES.inspectorW));
  const [min, max] = which === "chart" ? [15, 85] : SIZE_LIMITS[which === "palette" ? "paletteW" : "inspectorW"];

  return (
    <div
      ref={ref}
      className={`splitter splitter-${which}`}
      role="separator"
      tabIndex={0}
      aria-label={t(LABEL[which])}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      data-orientation={vertical ? "vertical" : "horizontal"}
      onKeyDown={onKey}
      onDoubleClick={reset}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.dataset.dragging = "";
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) fromPointer(e);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        delete e.currentTarget.dataset.dragging;
      }}
    />
  );
}
