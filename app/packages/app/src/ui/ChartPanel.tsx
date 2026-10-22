import { useEffect, useRef, useState } from "react";
import { newId, type Probe } from "@cs/model";
import { probeColor, themeFor } from "@cs/render";
import { useApp, useController, useDocument } from "./context";
import { useLiveValue } from "../live";
import { useStore } from "../store";
import { t } from "../messages";
import { attachChartInteraction } from "../chart/interaction";
import { fmt } from "../chart/format";
import { probeUnit } from "../chart/lanes";
import { moveProbeToLane } from "../chart/lane-edits";
import { ChartToolbar } from "../chart/ui/ChartToolbar";
import { LaneControls } from "../chart/ui/LaneControls";
import { CursorReadout } from "../chart/ui/CursorReadout";
import { lazyPanel } from "./lazy-panel";
import "../chart/chart.css";

// Shown on demand: its own chunk, loaded the first time it opens.
const MeasurementsPanel = lazyPanel(() => import("../chart/ui/MeasurementsPanel").then((m) => m.MeasurementsPanel));

const NEW_LANE = "__new__";

/** A probe's name, live value (or the value at the playhead while scrubbing) and lane. */
function LegendChip({ probe, color }: { probe: Probe; color: string }) {
  const c = useController();
  const lanes = useDocument((d) => d.lanes);
  const unit = probeUnit(probe);
  const v = useLiveValue(c.bus, () => {
    const ch = c.channelId(probe.id);
    const ph = c.chart?.state.playhead;
    if (c.chartSession.ui.get().scrubbing && ph !== undefined) {
      try {
        return c.history.view(ch, ph, ph).valueAt(ph);
      } catch {
        return undefined;
      }
    }
    return c.bus.lastValue(ch);
  });
  return (
    <li className="chip">
      <span className="swatch" style={{ background: color }} />
      {probe.name}: <output>{v === undefined ? "—" : fmt(v, unit)}</output>
      {lanes.length > 0 && (
        <select
          className="lane-pick"
          aria-label={t({ key: "chart.moveTo", values: { name: probe.name } })}
          value={probe.lane}
          onChange={(e) => {
            const id = e.target.value === NEW_LANE ? newId("ln") : e.target.value;
            c.edits.edit({ key: "chart.editLane" }, (d) => moveProbeToLane(d, probe.id, id, probe.quantity === "logic" ? "logic" : "analog"));
          }}
        >
          {lanes.map((l, i) => (
            <option key={l.id} value={l.id}>
              {t({ key: "chart.lane", values: { n: i + 1 } })}
            </option>
          ))}
          <option value={NEW_LANE}>{t("chart.newLane")}</option>
        </select>
      )}
    </li>
  );
}

/** Chart panel (rendering.md §5.2): toolbar, legend, lanes canvas, cursor readout, measurements. */
export function ChartPanel() {
  const c = useController();
  const host = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const probes = useDocument((d) => d.probes);
  const lanes = useDocument((d) => d.lanes);
  const ui = useStore(c.chartSession.ui, (s) => s);

  useEffect(() => {
    const el = host.current!;
    const chart = c.attachChart(el);
    const detach = attachChartInteraction(el, c, chart);
    const ro = new ResizeObserver(() => {
      const b = el.getBoundingClientRect();
      chart.resize(b.width, b.height);
      setHeight(b.height);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      detach();
      chart.dispose();
      c.chart = undefined;
    };
  }, [c]);

  const theme = themeFor(useApp((s) => s.theme ?? s.dark));
  const list = Object.values(probes);
  return (
    <section className="chart-panel" aria-label={t("chart.title")}>
      <ChartToolbar />
      <ul className="legend">
        {list.map((p) => (
          <LegendChip key={p.id} probe={p} color={probeColor(theme, p.style.color)} />
        ))}
        {list.length === 0 && <li className="hint">{t("chart.empty")}</li>}
      </ul>
      <div className="chart-body">
        <div ref={host} className="chart-canvas" data-lanes={lanes.length} tabIndex={0} aria-label={t("chart.title")} />
        {height > 0 && <LaneControls height={height} />}
      </div>
      {ui.cursors && <CursorReadout />}
      {ui.showMeasurements && <MeasurementsPanel />}
    </section>
  );
}
