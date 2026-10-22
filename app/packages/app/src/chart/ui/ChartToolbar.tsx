import { useState } from "react";
import { newId } from "@cs/model";
import type { ChartMode, TriggerSpec } from "@cs/render";
import { useStore } from "../../store";
import { useApp, useController, useDocument } from "../../ui/context";
import { t } from "../../messages";
import { fmt } from "../format";
import { addLane } from "../lane-edits";

/** Mode, trigger, window, cursors, ghosts, lanes (CHT-07–17, CHT-26). */
export function ChartToolbar() {
  const c = useController();
  const s = c.chartSession;
  const ui = useStore(s.ui, (x) => x);
  const probes = useDocument((d) => d.probes);
  const running = useApp((x) => x.runState) === "running";
  const list = Object.values(probes);

  return (
    <div className="chart-toolbar" role="toolbar" aria-label={t("chart.title")}>
      <label className="ctl">
        {t("chart.mode")}{" "}
        <select value={ui.mode} onChange={(e) => s.setMode(e.target.value as ChartMode)}>
          {(["roll", "sweep", "triggered"] as const).map((m) => (
            <option key={m} value={m}>
              {t(`chart.mode.${m}`)}
            </option>
          ))}
        </select>
      </label>
      {ui.mode === "triggered" && <TriggerControls />}
      <span className="ctl" title={t("chart.span")}>
        <button className="btn sm" aria-label={t("chart.zoomIn")} onClick={() => s.zoom(0.5)}>
          −
        </button>
        <output className="span">{fmt(ui.span, "s")}</output>
        <button className="btn sm" aria-label={t("chart.zoomOut")} onClick={() => s.zoom(2)}>
          +
        </button>
      </span>
      {!ui.live && (
        <button className="btn sm" onClick={() => s.goLive()}>
          {t("chart.live")}
        </button>
      )}
      <button className="btn sm" onClick={() => s.fitToCircuit()} disabled={!ui.timeScales}>
        {t("chart.fit")}
      </button>
      <button className="btn sm" aria-pressed={ui.cursors} onClick={() => s.toggleCursors()}>
        {t("chart.cursors")}
      </button>
      <button className="btn sm" onClick={() => s.keepTraces()} disabled={list.length === 0}>
        {t("chart.keep")}
      </button>
      {ui.ghosts.length > 0 && (
        <button className="btn sm" onClick={() => s.clearGhosts()}>
          {t("chart.clearGhosts")}
        </button>
      )}
      <button className="btn sm" onClick={() => c.edits.edit({ key: "chart.editLane" }, (d) => addLane(d, newId("ln")))}>
        {t("chart.addLane")}
      </button>
      <button className="btn sm" aria-pressed={ui.showMeasurements} onClick={() => s.ui.set({ showMeasurements: !ui.showMeasurements })}>
        {t("chart.measurements")}
      </button>
      {ui.scrubbing && !running && (
        <span className="ctl scrub">
          {ui.historyMissing && <span className="warn">{t("chart.noHistory")}</span>}
          <button className="btn sm primary" onClick={() => s.restartHere()}>
            {t("chart.restartHere")}
          </button>
          <button className="btn sm" onClick={() => s.endScrub()}>
            {t("chart.backToLatest")}
          </button>
        </span>
      )}
    </div>
  );
}

function TriggerControls() {
  const c = useController();
  const s = c.chartSession;
  const ui = useStore(s.ui, (x) => x);
  const probes = Object.values(useDocument((d) => d.probes));
  const [level, setLevel] = useState(String(ui.trigger.level));
  const set = (p: Partial<TriggerSpec>) => s.setTrigger(p);
  return (
    <>
      <label className="ctl">
        {t("chart.trigger")}{" "}
        <select value={ui.triggerProbe ?? ""} onChange={(e) => s.setTrigger({}, e.target.value)}>
          {!ui.triggerProbe && <option value="">—</option>}
          {probes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="ctl">
        {t("chart.trigger.level")}{" "}
        <input
          className="num"
          inputMode="decimal"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(v)) set({ level: v });
          }}
        />
      </label>
      <select aria-label="Edge" value={ui.trigger.edge} onChange={(e) => set({ edge: e.target.value as TriggerSpec["edge"] })}>
        <option value="rising">{t("chart.trigger.rising")}</option>
        <option value="falling">{t("chart.trigger.falling")}</option>
      </select>
      <select aria-label="Sweep" value={ui.trigger.sweep} onChange={(e) => set({ sweep: e.target.value as TriggerSpec["sweep"] })}>
        {(["auto", "normal", "single"] as const).map((m) => (
          <option key={m} value={m}>
            {t(`chart.trigger.${m}`)}
          </option>
        ))}
      </select>
      {ui.trigger.sweep === "single" && (
        <button className="btn sm" onClick={() => c.chart?.rearmTrigger()}>
          {t("chart.trigger.rearm")}
        </button>
      )}
    </>
  );
}
