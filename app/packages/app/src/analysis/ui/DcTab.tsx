import { useMemo, useState } from "react";
import type { DcResult } from "@cs/engine";
import { useApp, useController, useDocument } from "../../ui/context";
import { fmt } from "../../chart/format";
import { t } from "../../messages";
import { useAnalysisUi } from "./hooks";
import { RunBar } from "./RunBar";

const REGION: Record<string, string[]> = {
  bjt: ["cut-off", "active", "saturation", "reverse active"],
  mosfet: ["cut-off", "linear", "saturation"],
};

/** Plain-language operating region for semiconductors (ANL-03). */
function region(type: string, r: Record<string, number>): string {
  if (type.endsWith("transistor") && r.region !== undefined) return REGION.bjt[r.region] ?? "";
  if (type.endsWith("mosfet") && r.region !== undefined) return REGION.mosfet[r.region] ?? "";
  if (r.forward !== undefined) return r.forward ? "forward biased" : "off";
  if (r.state !== undefined) return ["off", "forward biased", "breakdown"][r.state] ?? "";
  if (r.saturated !== undefined) return r.saturated ? "saturated" : "linear";
  return "";
}

type SortKey = "label" | "type" | "voltage" | "current" | "power";

export function DcTab() {
  const c = useController();
  const st = useAnalysisUi((u) => u.tabs.dc);
  const parts = useDocument((d) => d.parts);
  const selection = useApp((s) => s.selection);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "label", dir: 1 });
  const r = st.result?.kind === "dc" ? (st.result as DcResult) : undefined;

  const rows = useMemo(() => {
    if (!r) return [];
    const list = r.parts.map((p) => ({ ...p, label: parts[p.id]?.label ?? p.id, region: region(p.type, p.readouts) }));
    return list.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
    });
  }, [r, parts, sort]);

  const head = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
        {label}
        {sort.key === key ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  return (
    <div className="an-tab">
      <RunBar tab="dc" auto />
      {r && !r.ok && <p className="an-note an-error">{t("analysis.noDc")}</p>}
      {r?.ok && (
        <>
          <p className="an-balance">
            {t({ key: "analysis.balance", values: { delivered: fmt(r.powerDelivered, "W"), absorbed: fmt(r.powerAbsorbed, "W") } })}
          </p>
          <div className="an-tables">
            <table className="an-table">
              <caption>{t("analysis.nodes")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("analysis.node")}</th>
                  <th scope="col">{t("analysis.voltage")}</th>
                </tr>
              </thead>
              <tbody>
                {r.nodes.map((n) => (
                  <tr key={n.index}>
                    <td>{n.name}</td>
                    <td>{fmt(n.voltage, "V")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="an-table">
              <caption>{t("analysis.parts")}</caption>
              <thead>
                <tr>
                  {head("label", t("analysis.part"))}
                  {head("type", t("analysis.type"))}
                  {head("voltage", t("analysis.voltage"))}
                  {head("current", t("analysis.current"))}
                  {head("power", t("analysis.power"))}
                  <th scope="col">{t("analysis.region")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={selection.includes(p.id) ? "selected" : undefined} onClick={() => c.store.set({ selection: [p.id] })} aria-selected={selection.includes(p.id)}>
                    <td>{p.label}</td>
                    <td>{p.type}</td>
                    <td>{fmt(p.voltage, "V")}</td>
                    <td>{fmt(p.current, "A")}</td>
                    <td>{fmt(p.power, "W")}</td>
                    <td>{p.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
