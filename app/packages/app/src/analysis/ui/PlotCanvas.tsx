import { useEffect, useRef } from "react";
import { drawPlot, type PlotSpec } from "../plot";
import { useTheme } from "./hooks";

/** A canvas that redraws its plot on data, theme, or size changes. */
export function PlotCanvas({ spec, label, height = 180, onPick }: { spec: PlotSpec; label: string; height?: number; onPick?(x: number): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const map = useRef<{ toX(px: number): number } | undefined>(undefined);
  const theme = useTheme();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const draw = () => (map.current = drawPlot(el, spec, theme));
    draw();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [spec, theme]);
  return (
    <canvas
      ref={ref}
      className="an-plot"
      role="img"
      aria-label={label}
      style={{ height }}
      onClick={(e) => {
        if (!onPick || !map.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        onPick(map.current.toX(e.clientX - r.left));
      }}
    />
  );
}
