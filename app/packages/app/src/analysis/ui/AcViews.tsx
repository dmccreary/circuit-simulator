// Impedance (ANL-13), Try this frequency (ANL-14) and Phasor (ANL-16) views
// of the Frequency tab.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "react-aria-components";
import type { AcResult } from "@cs/engine";
import { getDescriptor } from "@cs/elements";
import { probeColor, type Theme } from "@cs/render";
import { useController, useDocument } from "../../ui/context";
import { fmt } from "../../chart/format";
import { t } from "../../messages";
import { degrees, impedanceFrom, impedanceOutputs, magnitude, phasorJob, sineFrequency, tryFrequency } from "../ac-extras";
import type { PlotSpec } from "../plot";
import { NumberField, SelectField } from "./fields";
import { useSession, useTheme } from "./hooks";
import { PlotCanvas } from "./PlotCanvas";

const hz = (v: number) => fmt(v, "Hz", 2);

/** Run one AC job whenever its key changes; returns the latest result. */
function useAcJob(key: string, build: () => Parameters<ReturnType<typeof useSession>["service"]["submit"]>[0] | undefined): AcResult | undefined {
  const s = useSession();
  const [res, setRes] = useState<{ key: string; r: AcResult } | undefined>();
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    const job = buildRef.current();
    if (!job) return;
    const h = s.service.submit(job);
    void h.result.then((o) => {
      if (o.status === "done" && o.result.kind === "ac") setRes({ key, r: o.result });
    });
    return () => h.cancel();
  }, [key, s]);
  return res?.r; // the previous result stays while the next one computes
}

/** ANL-14: a frequency picked on the gain plot can be tried as a sine in the time view. */
export function TryFrequency({ freq, input }: { freq: number | undefined; input: string | undefined }) {
  const c = useController();
  const s = useSession();
  const type = useDocument((d) => (input ? d.parts[input]?.type : undefined));
  if (freq === undefined) return <p className="an-note">{t("analysis.tryHint")}</p>;
  const ok = !!input && type === "ac-source";
  return (
    <div className="an-try">
      <Button className="btn" isDisabled={!ok} onPress={() => input && tryFrequency(c, input, freq, () => s.close())}>
        {t({ key: "analysis.tryFrequency", values: { f: hz(freq) } })}
      </Button>
    </div>
  );
}

/** ANL-13: magnitude and phase of a part's impedance across the frequency range. */
export function ImpedanceView({ input, range }: { input: string | undefined; range: { start: number; stop: number; pointsPerDecade: number; scale: "log" | "linear" } }) {
  const s = useSession();
  const theme = useTheme();
  const parts = useDocument((d) => d.parts);
  const choices = useMemo(
    () =>
      Object.values(parts)
        .filter((p) => (getDescriptor(p.type)?.terminals.length ?? 0) === 2 && !["ground", "ammeter", "voltmeter"].includes(p.type))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((p) => ({ value: p.id, label: p.label })),
    [parts],
  );
  const [part, setPart] = useState<string | undefined>(input);
  const chosen = part && parts[part] ? part : input;
  const cc = s.compiled();
  const isSource = !!chosen && s.sources().some((x) => x.id === chosen);
  const key = cc && chosen ? JSON.stringify([chosen, input, range, cc.netlist]) : "";
  const r = useAcJob(key, () => {
    const outs = cc && chosen ? impedanceOutputs(cc, chosen) : undefined;
    if (!cc || !outs) return undefined;
    // A source is driven by itself; any other part by the chosen input.
    return { kind: "ac", netlist: cc.netlist, input: isSource ? chosen : input, outputs: outs, freqs: { ...range, points: 400 } };
  });
  const z = r && r.outputs.length === 2 ? impedanceFrom(r.outputs[0], r.outputs[1], isSource) : undefined;
  const log = range.scale !== "linear";
  const color = theme.probes[0];
  const magSpec: PlotSpec = {
    title: t("analysis.impedance.mag"),
    xLog: log,
    xFormat: hz,
    yFormat: (v) => fmt(v, "ohm", 3),
    series: z && r ? [{ x: r.freqs, y: z.mag, color }] : [],
  };
  const phSpec: PlotSpec = {
    title: t("analysis.impedance.phase"),
    xLog: log,
    xFormat: hz,
    yFormat: (v) => `${Number(v.toPrecision(3))}°`,
    series: z && r ? [{ x: r.freqs, y: z.deg, color }] : [],
  };
  return (
    <>
      <div className="an-form">
        <SelectField label={t("analysis.impedanceOf")} value={chosen} options={choices} onChange={(v) => setPart(v)} />
      </div>
      {z && (
        <>
          <PlotCanvas spec={magSpec} label={t("analysis.impedance.mag")} />
          <PlotCanvas spec={phSpec} label={t("analysis.impedance.phase")} height={150} />
        </>
      )}
    </>
  );
}

/** ANL-16: every probed voltage and current as an arrow at one frequency. */
export function PhasorView() {
  const s = useSession();
  const theme = useTheme();
  const probes = useDocument((d) => d.probes);
  const cc = s.compiled();
  const [freq, setFreq] = useState<number | undefined>();
  const f = freq ?? (cc && sineFrequency(cc.netlist)) ?? 1000;
  const outputs = s.outputs(["voltage", "current"]).map((o) => o.spec);
  const key = cc && outputs.length ? JSON.stringify([f, outputs, cc.netlist]) : "";
  const r = useAcJob(key, () => (cc && outputs.length ? phasorJob(cc.netlist, outputs, f) : undefined));
  const arrows = (r?.outputs ?? []).map((o, k) => {
    const p = probes[o.id];
    return {
      name: p?.name ?? o.id,
      quantity: p?.quantity ?? "voltage",
      color: p ? probeColor(theme, p.style.color) : theme.probes[k % theme.probes.length],
      mag: magnitude(o.re[0], o.im[0]),
      deg: degrees(o.re[0], o.im[0]),
    };
  });
  const allZero = arrows.length > 0 && arrows.every((a) => !(a.mag > 0));
  return (
    <>
      <div className="an-form">
        <NumberField label={t("analysis.phasorFrequency")} unit="Hz" value={f} min={1e-6} onCommit={setFreq} />
      </div>
      <p className="an-note">{t("analysis.phasorNote")}</p>
      {outputs.length === 0 && <p className="an-note">{t("analysis.needProbe")}</p>}
      {allZero && <p className="an-note">{t("analysis.phasorNeedSource")}</p>}
      {arrows.length > 0 && !allZero && <PhasorCanvas arrows={arrows} theme={theme} />}
      <ul className="an-markers">
        {arrows.map((a) => (
          <li key={a.name} style={{ color: a.color }}>
            {a.name}: {fmt(a.mag, a.quantity === "current" ? "A" : "V", 3)} ∠ {Number(a.deg.toPrecision(3))}°
          </li>
        ))}
      </ul>
    </>
  );
}

interface Arrow {
  name: string;
  quantity: string;
  color: string;
  mag: number;
  deg: number;
}

function PhasorCanvas({ arrows, theme }: { arrows: Arrow[]; theme: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    const g = el?.getContext("2d");
    if (!el || !g) return;
    const dpr = globalThis.devicePixelRatio || 1;
    const w = el.clientWidth || 260;
    const h = 220;
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = theme.chart.background;
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 18;
    g.strokeStyle = theme.chart.gridline;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.moveTo(cx - R, cy);
    g.lineTo(cx + R, cy);
    g.moveTo(cx, cy - R);
    g.lineTo(cx, cy + R);
    g.stroke();
    // Voltages and currents are scaled separately: each to its own largest arrow.
    const max = (q: string) => Math.max(1e-30, ...arrows.filter((a) => (a.quantity === "current") === (q === "current")).map((a) => a.mag));
    g.font = `12px ${theme.font}`;
    for (const a of arrows) {
      const len = (a.mag / max(a.quantity)) * R;
      const th = (a.deg * Math.PI) / 180;
      const x = cx + len * Math.cos(th);
      const y = cy - len * Math.sin(th);
      g.strokeStyle = a.color;
      g.fillStyle = a.color;
      g.lineWidth = a.quantity === "current" ? 2 : 3;
      if (a.quantity === "current") g.setLineDash([5, 3]);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(x, y);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
      g.fillText(a.name, x + 5, y - 5);
    }
  }, [arrows, theme]);
  return <canvas ref={ref} className="an-plot" role="img" aria-label={t("analysis.view.phasor")} style={{ height: 220 }} />;
}
