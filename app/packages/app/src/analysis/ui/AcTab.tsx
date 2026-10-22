import { useMemo } from "react";
import type { AcResult } from "@cs/engine";
import { probeColor } from "@cs/render";
import { useDocument } from "../../ui/context";
import { fmt } from "../../chart/format";
import { t } from "../../messages";
import { bodeMarkers, bodePoints } from "../markers";
import type { PlotSeries, PlotSpec } from "../plot";
import { NumberField, SelectField } from "./fields";
import { useAnalysisUi, useSession, useSettings, useTheme } from "./hooks";
import { PlotCanvas } from "./PlotCanvas";
import { RunBar } from "./RunBar";

const hz = (v: number) => fmt(v, "Hz", 2);

export function AcTab() {
  const s = useSession();
  const theme = useTheme();
  const [set, patch] = useSettings("ac");
  const st = useAnalysisUi((u) => u.tabs.ac);
  const probes = useDocument((d) => d.probes);
  useDocument((d) => d.parts); // source list follows part edits
  const sources = s.sources();
  const input = set.input ?? s.defaultInput();
  const r = st.result?.kind === "ac" ? (st.result as AcResult) : undefined;
  const ghost = st.ghost?.kind === "ac" ? (st.ghost as AcResult) : undefined;

  const { gain, phase, markers } = useMemo(() => {
    const gain: PlotSeries[] = [];
    const phase: PlotSeries[] = [];
    let markers: ReturnType<typeof bodeMarkers> = [];
    const add = (res: AcResult, ghostly: boolean) =>
      res.outputs.forEach((o, k) => {
        const p = probes[o.id];
        const color = p ? probeColor(theme, p.style.color) : theme.probes[k % theme.probes.length];
        const pts = bodePoints(res.freqs, o.re, o.im);
        const y = pts.map((q) => (set.gain === "db" ? q.db : Math.pow(10, q.db / 20)));
        gain.push({ x: res.freqs, y, color, dashed: ghostly, label: p?.name });
        phase.push({ x: res.freqs, y: pts.map((q) => q.deg), color, dashed: ghostly, label: p?.name });
        if (!ghostly && k === 0) markers = bodeMarkers(pts);
      });
    if (ghost && st.status === "running") add(ghost, true);
    if (r) add(r, false);
    return { gain, phase, markers };
  }, [r, ghost, st.status, probes, theme, set.gain]);

  const log = set.scale !== "linear";
  const gainSpec: PlotSpec = {
    title: `${t("analysis.gain")} (${set.gain === "db" ? "dB" : "V/V"})`,
    xLog: log,
    xFormat: hz,
    yFormat: (v) => (set.gain === "db" ? `${Number(v.toPrecision(3))} dB` : String(Number(v.toPrecision(3)))),
    series: gain,
    markers: markers.filter((m) => m.kind !== "phase").map((m) => ({ x: m.freq, label: m.label })),
  };
  const phaseSpec: PlotSpec = {
    title: t("analysis.phase"),
    xLog: log,
    xFormat: hz,
    yFormat: (v) => `${Number(v.toPrecision(3))}°`,
    series: phase,
    markers: markers.filter((m) => m.kind === "phase").map((m) => ({ x: m.freq, label: m.label })),
  };

  return (
    <div className="an-tab">
      <div className="an-form">
        <SelectField label={t("analysis.input")} value={input} options={sources.map((p) => ({ value: p.id, label: p.label }))} onChange={(v) => patch({ input: v })} />
        <NumberField label={t("analysis.start")} unit="Hz" value={set.start} min={1e-6} onCommit={(v) => patch({ start: v })} />
        <NumberField label={t("analysis.stop")} unit="Hz" value={set.stop} min={1e-6} onCommit={(v) => patch({ stop: v })} />
        {log && <NumberField label={t("analysis.ppd")} value={set.pointsPerDecade} min={1} onCommit={(v) => patch({ pointsPerDecade: Math.round(v) })} />}
        <SelectField label={t("analysis.axis")} value={set.scale} options={[{ value: "log", label: t("analysis.log") }, { value: "linear", label: t("analysis.linear") }]} onChange={(v) => patch({ scale: v })} />
        <SelectField label={t("analysis.gain")} value={set.gain} options={[{ value: "db", label: t("analysis.gain.db") }, { value: "ratio", label: t("analysis.gain.ratio") }]} onChange={(v) => patch({ gain: v })} />
      </div>
      <RunBar tab="ac" auto />
      {r?.nonlinear && <p className="an-note">{t("analysis.nonlinear")}</p>}
      {r && r.approximated.length > 0 && <p className="an-note">{t({ key: "analysis.approximated", values: { types: r.approximated.join(", ") } })}</p>}
      {r && !r.ok && <p className="an-note an-error">{t("analysis.noDc")}</p>}
      {(r || ghost) && (
        <>
          <PlotCanvas spec={gainSpec} label={t("analysis.gain")} />
          <PlotCanvas spec={phaseSpec} label={t("analysis.phase")} height={150} />
          <ul className="an-markers">
            {markers.map((m, i) => (
              <li key={i}>{m.label}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
