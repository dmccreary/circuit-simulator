import { cursorReadout, type CursorReadout as Readout } from "@cs/render";
import { useController } from "../../ui/context";
import { t } from "../../messages";
import { fmt } from "../format";
import { usePolled } from "../use-polled";

/** Δt, 1/Δt and per-trace values at cursors A and B (CHT-26–28). */
export function CursorReadout() {
  const c = useController();
  const r = usePolled<Readout | undefined>(() => {
    const ch = c.chart;
    const cur = ch?.state.cursors;
    if (!ch || !cur) return undefined;
    const traces = ch
      .getLanes()
      .flatMap((l) => l.traces.filter((tr) => !tr.ghost).map((tr) => ({ channelId: tr.channelId, name: tr.name, unit: tr.unit ?? l.unit })));
    return cursorReadout(cur, traces, (id, tt) => {
      try {
        return c.history.view(id, tt, tt).valueAt(tt);
      } catch {
        return NaN;
      }
    });
  }, 200);
  if (!r) return null;
  return (
    <div className="cursor-readout" aria-live="off">
      <span>
        A {fmt(r.a, "s", 4)} · B {fmt(r.b, "s", 4)} · {t("chart.cursor.dt")} {fmt(r.dt, "s", 4)} · {t("chart.cursor.freq")}{" "}
        {fmt(r.freq, "Hz", 4)}
      </span>
      <table>
        <tbody>
          {r.rows.map((row) => (
            <tr key={row.channelId}>
              <th scope="row">{row.name}</th>
              <td>A {fmt(row.a, row.unit, 4)}</td>
              <td>B {fmt(row.b, row.unit, 4)}</td>
              <td>Δ {fmt(row.delta, row.unit, 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
