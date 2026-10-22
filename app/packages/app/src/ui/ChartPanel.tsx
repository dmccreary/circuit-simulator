import { useEffect, useRef } from "react";
import { formatValue } from "@cs/units";
import { probeColor, themeFor } from "@cs/render";
import { useApp, useController, useDocument } from "./context";
import { useLiveValue } from "../live";
import { t } from "../messages";

function LegendChip({ probeId, name, color }: { probeId: string; name: string; color: string }) {
  const c = useController();
  const v = useLiveValue(c.bus, () => c.bus.lastValue(c.channelId(probeId)));
  return (
    <li className="chip">
      <span className="swatch" style={{ background: color }} />
      {name}: <output>{v === undefined ? "—" : formatValue(v, "V")}</output>
    </li>
  );
}

/** Chart panel chrome (legend) around the canvas chart renderer (rendering.md §5.2). */
export function ChartPanel() {
  const c = useController();
  const host = useRef<HTMLDivElement>(null);
  const probes = useDocument((d) => d.probes);
  const lanes = useDocument((d) => d.lanes);

  useEffect(() => {
    const el = host.current!;
    const chart = c.attachChart(el);
    const ro = new ResizeObserver(() => {
      const b = el.getBoundingClientRect();
      chart.resize(b.width, b.height);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      c.chart = undefined;
    };
  }, [c]);

  const theme = themeFor(useApp((s) => s.dark));
  const list = Object.values(probes);
  return (
    <section className="chart-panel" aria-label={t("chart.title")}>
      <ul className="legend">
        {list.map((p) => (
          <LegendChip key={p.id} probeId={p.id} name={p.name} color={probeColor(theme, p.style.color)} />
        ))}
        {list.length === 0 && <li className="hint">{t("chart.empty")}</li>}
      </ul>
      <div ref={host} className="chart-canvas" data-lanes={lanes.length} />
    </section>
  );
}
