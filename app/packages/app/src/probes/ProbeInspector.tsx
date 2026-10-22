// Probe settings (PRB-14): name, color, lane, value on the flag, direction
// for current probes, and Remove. Shown in the Inspector when a probe (its
// flag) is selected; double-clicking a flag selects it.

import { Button, Checkbox, Input, Label, TextField } from "react-aria-components";
import type { Probe } from "@cs/model";
import { probeColor, themeFor } from "@cs/render";
import { useApp, useController, useDocument } from "../ui/context";
import { t } from "../messages";
import { removeProbe, reverseProbe } from "./add";

const COLORS = Array.from({ length: 8 }, (_, i) => `probe.${i + 1}`);

export function ProbeInspector({ probe }: { probe: Probe }) {
  const c = useController();
  const dark = useApp((s) => s.dark);
  const lanes = useDocument((d) => d.lanes);
  const theme = themeFor(dark);
  const edit = (fn: (p: Probe) => void, coalesce?: string) =>
    c.edits.edit({ key: "probe.edit" }, (d) => {
      const p = d.probes[probe.id];
      if (p) fn(p);
    }, coalesce ? { coalesceKey: coalesce } : undefined);
  const directional = probe.quantity === "current";
  return (
    <form className="probe-inspector" onSubmit={(e) => e.preventDefault()} key={probe.id}>
      <p className="part-title">
        <strong>{probe.name}</strong> <span className="type">{t(`probe.quantity.${probe.quantity}`)}</span>
      </p>
      <TextField className="field" value={probe.name} onChange={(v) => edit((p) => void (p.name = v), `probe.name.${probe.id}`)}>
        <Label>{t("probe.name")}</Label>
        <Input />
      </TextField>
      <fieldset className="field probe-colors">
        <legend>{t("probe.color")}</legend>
        {COLORS.map((tok) => (
          <button
            key={tok}
            type="button"
            className={tok === probe.style.color ? "swatch on" : "swatch"}
            style={{ background: probeColor(theme, tok), width: 18, height: 18, borderRadius: 4, border: tok === probe.style.color ? "2px solid currentColor" : "1px solid #0003" }}
            aria-label={tok}
            aria-pressed={tok === probe.style.color}
            onClick={() => edit((p) => void (p.style.color = tok))}
          />
        ))}
      </fieldset>
      <label className="field">
        {t("probe.lane")}
        <select
          value={probe.lane}
          onChange={(e) => {
            const v = e.target.value;
            c.edits.edit({ key: "probe.edit" }, (d) => {
              const p = d.probes[probe.id];
              if (!p) return;
              if (v === "__new") {
                const id = `ln${Date.now().toString(36)}`;
                d.lanes.push({ id, kind: p.quantity === "logic" ? "logic" : "analog", yScale: { mode: "auto" } });
                p.lane = id;
              } else p.lane = v;
            });
          }}
        >
          {lanes.map((l, i) => (
            <option key={l.id} value={l.id}>
              {`${i + 1}: ${l.kind}`}
            </option>
          ))}
          <option value="__new">{t("probe.newLane")}</option>
        </select>
      </label>
      <Checkbox className="check" isSelected={probe.flag.showValue} onChange={(v) => edit((p) => void (p.flag.showValue = v))}>
        <span className="box" aria-hidden /> {t("probe.showValue")}
      </Checkbox>
      {directional && (
        <Button className="btn" onPress={() => c.edits.edit({ key: "probe.reverse" }, (d) => void reverseProbe(d, probe.id))}>
          ⇄ {t("probe.reverseButton")}
        </Button>
      )}
      <Button
        className="btn"
        onPress={() => {
          c.edits.edit({ key: "probe.remove" }, (d) => removeProbe(d, probe.id));
          c.store.set({ selection: [] });
        }}
      >
        {t("probe.remove")}
      </Button>
    </form>
  );
}
