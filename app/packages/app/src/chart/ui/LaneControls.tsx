import { useState } from "react";
import type { Lane } from "@cs/model";
import { GUTTER_RIGHT, LANE_PAD, layoutLanes } from "@cs/render";
import { useController, useDocument } from "../../ui/context";
import { t } from "../../messages";
import { moveLane, removeLane, setLaneKind, setLaneScale } from "../lane-edits";

/** Per-lane controls drawn over each band (CHT-01–04, CHT-12, CHT-13). */
export function LaneControls({ height }: { height: number }) {
  const lanes = useDocument((d) => d.lanes);
  const layout = layoutLanes(
    lanes.map((l) => l.height),
    height,
  );
  return (
    <>
      {lanes.map((lane, i) => {
        const b = layout.bands[i];
        if (!b) return null;
        return (
          <div
            key={lane.id}
            className="lane-controls"
            style={{ top: b.top + LANE_PAD + 2, right: GUTTER_RIGHT + 4 }}
            role="group"
            aria-label={t({ key: "chart.lane", values: { n: i + 1 } })}
          >
            <LaneRow lane={lane} index={i} count={lanes.length} />
          </div>
        );
      })}
    </>
  );
}

function LaneRow({ lane, index, count }: { lane: Lane; index: number; count: number }) {
  const c = useController();
  const edit = (fn: Parameters<typeof c.edits.edit>[1]) => c.edits.edit({ key: "chart.editLane" }, fn);
  const fixed = lane.yScale?.mode === "fixed";
  const [min, setMin] = useState(String(lane.yScale?.min ?? ""));
  const [max, setMax] = useState(String(lane.yScale?.max ?? ""));

  const makeFixed = () => {
    const r = c.chart?.laneRange(lane.id) ?? { min: -1, max: 1 };
    setMin(String(r.min));
    setMax(String(r.max));
    edit((d) => setLaneScale(d, lane.id, { mode: "fixed", min: r.min, max: r.max }));
  };
  const commitFixed = (lo: string, hi: string) => {
    const a = Number(lo);
    const b = Number(hi);
    if (lo.trim() && hi.trim() && Number.isFinite(a) && Number.isFinite(b) && b > a) {
      edit((d) => setLaneScale(d, lane.id, { mode: "fixed", min: a, max: b }));
    }
  };

  return (
    <>
      <select
        aria-label={t("chart.lane.kind")}
        value={lane.kind}
        onChange={(e) => edit((d) => setLaneKind(d, lane.id, e.target.value as Lane["kind"]))}
      >
        <option value="analog">{t("chart.lane.analog")}</option>
        <option value="logic">{t("chart.lane.logic")}</option>
      </select>
      {lane.kind === "analog" && (
        <>
          <button
            className="btn xs"
            aria-pressed={!fixed}
            onClick={() => {
              edit((d) => setLaneScale(d, lane.id, { mode: "auto" }));
              c.chart?.resetRanges(lane.id);
            }}
          >
            {t("chart.lane.auto")}
          </button>
          <button className="btn xs" aria-pressed={fixed} onClick={makeFixed}>
            {t("chart.lane.fixed")}
          </button>
          {fixed && (
            <>
              <input
                className="num"
                aria-label={t("chart.lane.min")}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                onBlur={() => commitFixed(min, max)}
                onKeyDown={(e) => e.key === "Enter" && commitFixed(min, max)}
              />
              <input
                className="num"
                aria-label={t("chart.lane.max")}
                value={max}
                onChange={(e) => setMax(e.target.value)}
                onBlur={() => commitFixed(min, max)}
                onKeyDown={(e) => e.key === "Enter" && commitFixed(min, max)}
              />
            </>
          )}
        </>
      )}
      <button className="btn xs" aria-label={t("chart.lane.up")} disabled={index === 0} onClick={() => edit((d) => moveLane(d, lane.id, -1))}>
        ↑
      </button>
      <button
        className="btn xs"
        aria-label={t("chart.lane.down")}
        disabled={index === count - 1}
        onClick={() => edit((d) => moveLane(d, lane.id, 1))}
      >
        ↓
      </button>
      <button className="btn xs" aria-label={t("chart.lane.remove")} disabled={count <= 1} onClick={() => edit((d) => removeLane(d, lane.id))}>
        ×
      </button>
    </>
  );
}
