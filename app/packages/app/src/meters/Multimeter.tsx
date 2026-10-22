// The virtual multimeter panel (PRB-24): a dial, a four-digit autoranging
// display, and red and black leads the student drags onto the circuit.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "@cs/model";
import { useController } from "../ui/context";
import { useLiveValue } from "../live";
import { useStore } from "../store";
import { t } from "../messages";
import { measureOf } from "../probes/install";
import type { MeasureSession, MeasureUi, MeterMode, MeterState } from "../probes/session";
import { nodeTarget } from "../probes/targets";
import { analysisOf } from "../analysis/session";
import { CONTINUITY_OHMS, LeadSampler, dmmText, isPowered, leadVoltage, ohmmeterNetlist, ohmsFrom } from "./dmm";

const MODES: MeterMode[] = ["dcv", "acv", "ohm", "diode", "continuity", "amps"];
const selectMeter = (u: MeasureUi) => u.meter;

function leadNodes(s: MeasureSession, m: MeterState): { red: number; black: number } | undefined {
  const red = m.red && s.nodeOf(m.red.target);
  const black = m.black && s.nodeOf(m.black.target);
  return red === undefined || black === undefined ? undefined : { red, black };
}

/** Volts from the live frames: DC average, or true RMS of the AC part. */
function useVolts(s: MeasureSession, m: MeterState): string {
  const c = s.c;
  const sampler = useMemo(() => new LeadSampler(), []);
  const nodes = leadNodes(s, m);
  const key = nodes ? `${nodes.red}/${nodes.black}` : "";
  useEffect(() => {
    sampler.clear();
    if (!nodes) return;
    return c.bus.subscribe((f) => {
      const cc = c.compiled;
      if (cc) sampler.push(f.t1, leadVoltage({ compiled: cc, display: f.display }, nodes.red, nodes.black));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, key, sampler]);
  return useLiveValue(c.bus, () => {
    if (!nodes) return "– – –";
    if (s.blind()) return "?";
    const live = s.live();
    if (sampler.length === 0 && live) sampler.push(0, leadVoltage(live, nodes.red, nodes.black));
    const st = sampler.stats();
    return dmmText(m.mode === "acv" ? st?.acRms : st?.mean, "V");
  });
}

/** Ohms, diode test and continuity: one DC solve with the meter's test current, on an unpowered circuit. */
function useOhms(s: MeasureSession, m: MeterState): { text: string; note?: string; beep?: boolean } {
  const c = s.c;
  const nodes = leadNodes(s, m);
  const powered = useLiveValue(c.bus, () => isPowered(s.live()));
  const [result, setResult] = useState<{ key: string; v: number } | undefined>();
  const cc = c.compiled;
  const key = nodes && cc && !powered ? `${nodes.red}/${nodes.black}/${JSON.stringify(cc.netlist)}` : "";
  useEffect(() => {
    if (!key || !nodes || !cc) return;
    const h = analysisOf(c).service.submit({ kind: "dc", netlist: ohmmeterNetlist(cc.netlist, nodes.red, nodes.black) });
    void h.result.then((o) => {
      if (o.status !== "done" || o.result.kind !== "dc" || !o.result.ok) return setResult({ key, v: Infinity });
      const d = o.result.display;
      setResult({ key, v: (d[nodes.red] ?? 0) - (d[nodes.black] ?? 0) });
    });
    return () => h.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!nodes) return { text: "– – –" };
  if (powered) return { text: "– – –", note: t("dmm.powered") };
  if (s.blind()) return { text: "?" };
  const v = result?.key === key ? result.v : undefined;
  if (v === undefined) return { text: "…" };
  if (m.mode === "diode") return { text: Math.abs(v) > 3 ? "OL" : dmmText(v, "V") };
  const r = ohmsFrom(v);
  if (m.mode === "continuity") return { text: r === Infinity ? "OL" : dmmText(r, "ohm"), beep: r < CONTINUITY_OHMS };
  return { text: r === Infinity ? "OL" : dmmText(r, "ohm") };
}

function beep(): void {
  try {
    const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctx) return;
    const a = new Ctx();
    const o = a.createOscillator();
    o.frequency.value = 2400;
    o.connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.15);
    o.onended = () => void a.close();
  } catch {
    // no audio: the mark still shows
  }
}

function Display({ s, m }: { s: MeasureSession; m: MeterState }) {
  const volts = m.mode === "dcv" || m.mode === "acv";
  const v = useVolts(s, m);
  const o = useOhms(s, volts || m.mode === "amps" ? { mode: m.mode } : m);
  const text = m.mode === "amps" ? "– – –" : volts ? v : o.text;
  const beeped = useRef(false);
  useEffect(() => {
    if (o.beep && !beeped.current) beep();
    beeped.current = !!o.beep;
  }, [o.beep]);
  return (
    <>
      <output className="dmm-display measure-value" aria-live="polite">
        {text}
        {m.mode === "continuity" && o.beep && <span className="dmm-beep"> ♪</span>}
      </output>
      {m.mode === "amps" && <p className="dmm-note">{t("dmm.amps")}</p>}
      {!volts && o.note && <p className="dmm-note">{o.note}</p>}
    </>
  );
}

/** A lead tip; dropped on the circuit it attaches to the node under it. */
function Lead({ s, which, docked }: { s: MeasureSession; which: "red" | "black"; docked: boolean }) {
  const drag = useRef<Point | undefined>(undefined);
  const ref = useRef<HTMLDivElement | null>(null);
  const drop = (clientX: number, clientY: number) => {
    const r = s.c.schematic;
    const host = s.ui.get().host;
    if (!r || !host) return;
    const rect = host.getBoundingClientRect();
    const screen = { x: clientX - rect.left, y: clientY - rect.top };
    const hit = r.hitTest(screen)[0]?.target;
    const target = hit && nodeTarget(hit, r.view.toGrid(screen), { terminals: (id) => r.terminalsOf(id) });
    const m = s.ui.get().meter;
    if (!m) return;
    s.ui.set({ meter: { ...m, [which]: target ? { target, at: r.view.snap(screen) } : undefined } });
    s.redraw();
  };
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el && !docked) s.leadEls.set(which, el);
        else if (!el || docked) s.leadEls.delete(which);
        s.redraw();
      }}
      className={`dmm-lead ${which}${docked ? " docked" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${which} lead`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !ref.current) return;
        ref.current.style.translate = `${e.clientX - d.x}px ${e.clientY - d.y}px`;
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        drag.current = undefined;
        if (ref.current) ref.current.style.translate = "";
        drop(e.clientX, e.clientY);
      }}
    />
  );
}

export function Multimeter() {
  const c = useController();
  const s = measureOf(c);
  const m = useStore(s.ui, selectMeter);
  if (!m) return null;
  const set = (patch: Partial<MeterState>) => s.ui.set({ meter: { ...m, ...patch } });
  return (
    <>
      <section className="dmm" aria-label={t("dmm.title")}>
        <header>
          <strong>{t("dmm.title")}</strong>
          <button type="button" aria-label={t("dmm.close")} onClick={() => s.ui.set({ meter: null })}>
            ✕
          </button>
        </header>
        <Display s={s} m={m} />
        <label className="dmm-dial">
          <select value={m.mode} onChange={(e) => set({ mode: e.target.value as MeterMode })} aria-label={t("dmm.title")}>
            {MODES.map((k) => (
              <option key={k} value={k}>
                {t(`dmm.mode.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="dmm-jacks">
          {!m.red && <Lead s={s} which="red" docked />}
          {!m.black && <Lead s={s} which="black" docked />}
          <button type="button" onClick={() => set({ red: m.black, black: m.red })} disabled={!m.red && !m.black}>
            {t("dmm.swap")}
          </button>
        </div>
        {(!m.red || !m.black) && <p className="dmm-note">{t("dmm.leads")}</p>}
      </section>
      {m.red && <Lead s={s} which="red" docked={false} />}
      {m.black && <Lead s={s} which="black" docked={false} />}
    </>
  );
}
