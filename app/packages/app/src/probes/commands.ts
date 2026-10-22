// Measurement commands. Ids under "probe." share the probe tool's capability
// (embed and lesson modes that allow probes allow all of them).

import type { CommandRegistry } from "../commands/registry";
import type { AppController } from "../controller";
import { removeProbe } from "./add";
import { measureOf } from "./install";

export function registerMeasureCommands(r: CommandRegistry<AppController>): void {
  r.register({ id: "probe.current", label: { key: "tool.probeCurrent" }, defaultKeys: ["I"], run: (c) => c.setTool({ id: "probe-i" }) });
  r.register({ id: "probe.power", label: { key: "tool.probePower" }, defaultKeys: ["Shift+P"], run: (c) => c.setTool({ id: "probe-p" }) });
  r.register({ id: "probe.loop", label: { key: "tool.loop" }, defaultKeys: ["K"], run: (c) => c.setTool({ id: "loop" }) });
  r.register({ id: "probe.junction", label: { key: "tool.junction" }, defaultKeys: ["J"], run: (c) => c.setTool({ id: "junction" }) });
  r.register({
    id: "probe.multimeter",
    label: { key: "cmd.multimeter" },
    defaultKeys: ["M"],
    run: (c) => {
      const s = measureOf(c);
      s.ui.set({ meter: s.ui.get().meter ? null : { mode: "dcv" } });
    },
  });
  r.register({
    id: "probe.removeAll",
    label: { key: "cmd.removeAllProbes" },
    when: (c) => Object.keys(c.edits.doc.probes).length > 0,
    run: (c) =>
      c.edits.edit({ key: "probe.removeAll" }, (d) => {
        for (const id of Object.keys(d.probes)) removeProbe(d, id);
      }),
  });
  r.register({
    id: "probe.toggleValues",
    label: { key: "cmd.toggleProbeValues" },
    when: (c) => Object.keys(c.edits.doc.probes).length > 0,
    run: (c) =>
      c.edits.edit({ key: "probe.edit" }, (d) => {
        const show = !Object.values(d.probes).every((p) => p.flag.showValue);
        for (const p of Object.values(d.probes)) p.flag.showValue = show;
      }),
  });
}
