import { useMemo } from "react";
import type { SpectrumResult } from "@cs/engine";
import { probeColor } from "@cs/render";
import { useDocument } from "../../ui/context";
import { fmt } from "../../chart/format";
import { probeUnit } from "../../chart/lanes";
import { t } from "../../messages";
import type { PlotSpec } from "../plot";
import { SelectField } from "./fields";
import { useAnalysisUi, useSettings, useTheme } from "./hooks";
import { PlotCanvas } from "./PlotCanvas";
import { RunBar } from "./RunBar";

export function SpectrumTab() {
  const theme = useTheme();
  const [set, patch] = useSettings("spectrum");
  const st = useAnalysisUi((u) => u.tabs.spectrum);
  const probes = useDocument((d) => d.probes);
  const ids = Object.keys(probes);
  const probeId = set.probe && probes[set.probe] ? set.probe : ids[0];
  const probe = probeId ? probes[probeId] : undefined;
  const unit = probe ? probeUnit(probe) : "";
  const r = st.result?.kind === "spectrum" ? (st.result as SpectrumResult) : undefined;

  const spec: PlotSpec | undefined = useMemo(() => {
    if (!r || r.freqs.length === 0) return undefined;
    const db = set.units === "db";
    const start = set.axis === "log" ? 1 : 0;
    const y = r.amplitude.map((a) => (db ? 20 * Math.log10(Math.max(a / Math.SQRT2, 1e-12)) : a / Math.SQRT2)).slice(start);
    const top = Math.max(...y.filter(Number.isFinite));
    return {
      xLog: set.axis === "log",
      xFormat: (v) => fmt(v, "Hz", 2),
      yFormat: (v) => (db ? `${Number(v.toPrecision(3))} dB` : fmt(v, unit, 3)),
      yRange: db ? [top - 100, top + 5] : [0, top * 1.05 || 1],
      series: [{ x: r.freqs.slice(start), y, color: probe ? probeColor(theme, probe.style.color) : theme.probes[0], bars: r.freqs.length < 400 }],
      markers: r.fundamental ? [{ x: r.fundamental.freq, label: "1" }, ...r.harmonics.filter((h) => h.amplitude > r.fundamental!.amplitude * 1e-3).map((h) => ({ x: h.freq, label: String(h.n) }))] : [],
    };
  }, [r, set.units, set.axis, probe, theme, unit]);

  return (
    <div className="an-tab">
      <div className="an-form">
        <SelectField label={t("analysis.trace")} value={probeId} options={ids.map((k) => ({ value: k, label: probes[k].name }))} onChange={(v) => patch({ probe: v })} />
        <SelectField
          label={t("analysis.source")}
          value={set.source}
          options={(["visible", "cursors", "all"] as const).map((v) => ({ value: v, label: t(`analysis.source.${v}`) }))}
          onChange={(v) => patch({ source: v })}
        />
        <SelectField label={t("analysis.window")} value={set.window} options={(["hann", "rect", "flattop"] as const).map((v) => ({ value: v, label: t(`analysis.window.${v}`) }))} onChange={(v) => patch({ window: v })} />
        <SelectField label={t("analysis.axis")} value={set.axis} options={[{ value: "linear", label: t("analysis.linear") }, { value: "log", label: t("analysis.log") }]} onChange={(v) => patch({ axis: v })} />
        <SelectField label={t("analysis.units")} value={set.units} options={[{ value: "db", label: t("analysis.units.db") }, { value: "rms", label: t("analysis.units.rms") }]} onChange={(v) => patch({ units: v })} />
      </div>
      <RunBar tab="spectrum" />
      {spec && <PlotCanvas spec={spec} label={probe?.name ?? ""} height={220} />}
      {r && r.fundamental && (
        <p className="an-note">
          {t({
            key: "analysis.fundamental",
            values: { f: fmt(r.fundamental.freq, "Hz"), a: fmt(r.fundamental.amplitude, unit), thd: r.thd === undefined ? "—" : `${(r.thd * 100).toFixed(2)}%` },
          })}
        </p>
      )}
      {r && r.resolution > 0 && <p className="an-note">{t({ key: "analysis.resolution", values: { res: fmt(r.resolution, "Hz") } })}</p>}
    </div>
  );
}
