import { useMemo, useState } from "react";
import type { SweepMeasure, SweepResult } from "@cs/engine";
import { getDescriptor } from "@cs/elements";
import { useController, useDocument } from "../../ui/context";
import { fmt } from "../../chart/format";
import { probeUnit } from "../../chart/lanes";
import { t, propLabel } from "../../messages";
import type { PlotSpec } from "../plot";
import type { RangeSettings } from "../settings";
import { NumberField, SelectField, TextField } from "./fields";
import { useAnalysisUi, useSession, useSettings } from "./hooks";
import { PlotCanvas } from "./PlotCanvas";
import { RunBar } from "./RunBar";

const unitOf = (type: string | undefined, key: string | undefined) =>
  (type && key && getDescriptor(type)?.props.find((p) => p.key === key)?.unit) || "";

/** Color along a blue → red gradient for curve i of n (ANL-18 legend of values). */
const gradient = (i: number, n: number) => `hsl(${Math.round(220 - (220 * i) / Math.max(1, n - 1))} 70% 45%)`;

function ParamPicker({ element, prop, onChange, label }: { element?: string; prop?: string; onChange(element: string | undefined, key: string | undefined): void; label: string }) {
  const s = useSession();
  useDocument((d) => d.parts);
  const parts = s.sweepableParts();
  const keys = parts.find((p) => p.id === element)?.keys ?? [];
  return (
    <>
      <SelectField label={label} value={element} options={parts.map((p) => ({ value: p.id, label: p.label }))} onChange={(v) => onChange(v, parts.find((p) => p.id === v)?.keys[0])} />
      <SelectField label={t("analysis.property")} value={prop} options={keys.map((k) => ({ value: k, label: propLabel(k) }))} onChange={(v) => onChange(element, v)} />
    </>
  );
}

function RangeFields<T extends RangeSettings>({ set, patch, unit }: { set: T; patch(p: Partial<T>): void; unit: string }) {
  return (
    <>
      <NumberField label={t("analysis.start")} unit={unit} value={set.start} onCommit={(v) => patch({ start: v } as Partial<T>)} />
      <NumberField label={t("analysis.stop")} unit={unit} value={set.stop} onCommit={(v) => patch({ stop: v } as Partial<T>)} />
      <NumberField label={t("analysis.steps")} value={set.steps} min={1} onCommit={(v) => patch({ steps: Math.round(v) } as Partial<T>)} />
      <SelectField label={t("analysis.axis")} value={set.scale} options={[{ value: "linear", label: t("analysis.linear") }, { value: "log", label: t("analysis.log") }]} onChange={(v) => patch({ scale: v } as Partial<T>)} />
      <TextField label={t("analysis.list")} value={set.list ?? ""} placeholder="1k, 2.2k, 4.7k" onCommit={(v) => patch({ list: v } as Partial<T>)} />
    </>
  );
}

/** Pick which probe to plot from a sweep result, and draw the family (ANL-18, ANL-21). */
function SweepPlot({ r, xUnit, paramUnit, xLog }: { r: SweepResult; xUnit: string; paramUnit: string; xLog?: boolean }) {
  const c = useController();
  const probes = useDocument((d) => d.probes);
  const ids = Object.keys(r.series[0]?.y ?? {});
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const id = picked && ids.includes(picked) ? picked : ids[0];
  const probe = id ? probes[id] : undefined;
  const yUnit = probe ? probeUnit(probe) : "";
  const spec: PlotSpec = useMemo(
    () => ({
      xLog,
      xFormat: (v) => fmt(v, xUnit, 3),
      yFormat: (v) => fmt(v, yUnit, 3),
      series: r.series.map((s, i) => ({ x: s.x, y: id ? s.y[id] : [], color: gradient(i, r.series.length), label: s.value === undefined ? undefined : fmt(s.value, paramUnit) })),
    }),
    [r, id, xUnit, yUnit, paramUnit, xLog],
  );
  const pickValue = (x: number) => {
    if (r.sweep === "transient") return;
    let best = 0;
    r.values.forEach((v, i) => Math.abs(v - x) < Math.abs(r.values[best] - x) && (best = i));
    setChosen(r.values[best]);
  };
  return (
    <>
      <SelectField label={t("analysis.output")} value={id} options={ids.map((k) => ({ value: k, label: probes[k]?.name ?? k }))} onChange={setPicked} />
      <PlotCanvas spec={spec} label={probe?.name ?? ""} height={220} onPick={pickValue} />
      {r.series.some((s) => s.value !== undefined) && (
        <ul className="an-legend">
          {r.series.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => setChosen(s.value)}>
                <span className="swatch" style={{ background: gradient(i, r.series.length) }} /> {fmt(s.value ?? NaN, paramUnit)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen !== undefined && Number.isFinite(chosen) && r.sweep !== "dc" && (
        <p className="an-note">
          {fmt(chosen, paramUnit)}{" "}
          <button
            type="button"
            className="btn"
            onClick={() =>
              c.edits.edit({ key: "analysis.useValue" }, (d) => {
                const p = d.parts[r.param.element];
                if (p) p.props[r.param.key] = chosen;
              })
            }
          >
            Use this value
          </button>
        </p>
      )}
      {r.failed.length > 0 && <p className="an-note an-error">{t({ key: "analysis.failed", values: { n: r.failed.length } })}</p>}
    </>
  );
}

export function DcSweepTab() {
  const [set, patch] = useSettings("dcSweep");
  const st = useAnalysisUi((u) => u.tabs.dcSweep);
  const parts = useDocument((d) => d.parts);
  const unit = unitOf(set.element ? parts[set.element]?.type : undefined, set.key);
  const r = st.result?.kind === "sweep" ? (st.result as SweepResult) : undefined;
  return (
    <div className="an-tab">
      <div className="an-form">
        <ParamPicker label={t("analysis.vary")} element={set.element} prop={set.key} onChange={(element, key) => patch({ element, key })} />
        <RangeFields set={set} patch={patch} unit={unit} />
        <ParamPicker label={t("analysis.outer")} element={set.outerElement} prop={set.outerKey} onChange={(outerElement, outerKey) => patch({ outerElement, outerKey })} />
        <TextField label={t("analysis.outerValues")} value={set.outerList ?? ""} placeholder="10µ, 20µ, 30µ" onCommit={(v) => patch({ outerList: v })} />
      </div>
      <RunBar tab="dcSweep" />
      {r && r.series.length > 0 && <SweepPlot r={r} xUnit={unit} paramUnit={unitOf(set.outerElement ? parts[set.outerElement]?.type : undefined, set.outerKey)} xLog={set.scale === "log" && !set.list} />}
    </div>
  );
}

const MEASURES: SweepMeasure[] = ["final", "max", "min", "peakToPeak", "average", "rms"];

export function ParamSweepTab() {
  const [set, patch] = useSettings("paramSweep");
  const st = useAnalysisUi((u) => u.tabs.paramSweep);
  const parts = useDocument((d) => d.parts);
  const unit = unitOf(set.element ? parts[set.element]?.type : undefined, set.key);
  const r = st.result?.kind === "sweep" ? (st.result as SweepResult) : undefined;
  return (
    <div className="an-tab">
      <div className="an-form">
        <ParamPicker label={t("analysis.vary")} element={set.element} prop={set.key} onChange={(element, key) => patch({ element, key })} />
        <RangeFields set={set} patch={patch} unit={unit} />
        <SelectField
          label={t("analysis.kind")}
          value={set.kind}
          options={[
            { value: "transient", label: t("analysis.kind.transient") },
            { value: "measurement", label: t("analysis.kind.measurement") },
          ]}
          onChange={(v) => patch({ kind: v })}
        />
        <NumberField label={t("analysis.duration")} unit="s" value={set.duration} min={1e-12} onCommit={(v) => patch({ duration: v })} />
        {set.kind === "measurement" && <SelectField label={t("analysis.measure")} value={set.measure} options={MEASURES.map((m) => ({ value: m, label: propLabel(m) }))} onChange={(v) => patch({ measure: v })} />}
      </div>
      <RunBar tab="paramSweep" />
      {r && r.series.length > 0 && <SweepPlot r={r} xUnit={r.sweep === "transient" ? "s" : unit} paramUnit={unit} xLog={r.sweep === "measurement" && set.scale === "log" && !set.list} />}
    </div>
  );
}
