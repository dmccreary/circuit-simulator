import type { Probe } from "@cs/model";
import { probeColor, themeFor } from "@cs/render";
import { useApp, useController, useDocument } from "../../ui/context";
import { t } from "../../messages";
import { fmtResult } from "../format";
import { probeUnit } from "../lanes";
import { addMeasurement, removeMeasurement } from "../lane-edits";
import { MEASUREMENT_KINDS, measureWindow, measurementInfo } from "../measure";
import { usePolled } from "../use-polled";

/**
 * Per-probe measurements (CHT-30) over the visible window, or between the
 * cursors when they are on. The chosen measurements live in Probe.measurements.
 */
export function MeasurementsPanel() {
  const probes = Object.values(useDocument((d) => d.probes));
  return (
    <div className="measurements">
      {probes.length === 0 && <p className="hint">{t("chart.empty")}</p>}
      {probes.map((p) => (
        <ProbeMeasurements key={p.id} probe={p} />
      ))}
    </div>
  );
}

function ProbeMeasurements({ probe }: { probe: Probe }) {
  const c = useController();
  const theme = themeFor(useApp((s) => s.theme ?? s.dark));
  const unit = probeUnit(probe);
  const kinds = probe.measurements.map((m) => m.kind);
  const values = usePolled(() => {
    const ch = c.chart;
    if (!ch || kinds.length === 0) return {} as Record<string, string>;
    const cur = ch.state.cursors;
    const w = cur ? { t0: Math.min(cur.a, cur.b), t1: Math.max(cur.a, cur.b) } : ch.visibleWindow();
    const t1 = Math.min(w.t1, ch.state.latest);
    const res = measureWindow(c.history, c.channelId(probe.id), w.t0, t1, kinds);
    return Object.fromEntries(kinds.map((k) => [k, fmtResult(res[k], measurementInfo(k)?.unit(unit) ?? unit)]));
  }, 300);
  const edit = (fn: Parameters<typeof c.edits.edit>[1]) => c.edits.edit({ key: "chart.editMeasurement" }, fn);

  return (
    <div className="probe-measurements">
      <span className="name">
        <span className="swatch" style={{ background: probeColor(theme, probe.style.color) }} />
        {probe.name}
      </span>
      <ul>
        {kinds.map((k) => {
          const label = measurementInfo(k)?.label ?? k;
          return (
            <li key={k} className="measure-chip">
              {label}: <output>{values[k] ?? "—"}</output>
              <button
                className="btn xs"
                aria-label={t({ key: "chart.removeMeasurement", values: { name: label } })}
                onClick={() => edit((d) => removeMeasurement(d, probe.id, k))}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <select
        aria-label={t("chart.addMeasurement")}
        value=""
        onChange={(e) => e.target.value && edit((d) => addMeasurement(d, probe.id, e.target.value))}
      >
        <option value="">{t("chart.addMeasurement")}</option>
        {MEASUREMENT_KINDS.filter((m) => !kinds.includes(m.kind)).map((m) => (
          <option key={m.kind} value={m.kind}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
