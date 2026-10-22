import { rotateSelection, terminalsOf } from "../edit/transform";
import type { CommandRegistry } from "./registry";
import type { AppController } from "../controller";

/** The shell's first commands (app-shell.md §2). Labels are message keys (Overview §7.2). */
export function registerBuiltinCommands(r: CommandRegistry<AppController>): void {
  r.register({
    id: "sim.runPause",
    label: { key: "cmd.runPause" },
    defaultKeys: ["Space"],
    run: (c) => (c.store.get().runState === "running" ? c.pause() : c.run()),
  });
  r.register({ id: "sim.step", label: { key: "cmd.step" }, defaultKeys: ["."], run: (c) => c.step() });
  r.register({ id: "sim.reset", label: { key: "cmd.reset" }, defaultKeys: ["Mod+Shift+R"], run: (c) => c.reset() });
  r.register({
    id: "edit.undo",
    label: { key: "cmd.undo" },
    defaultKeys: ["Mod+Z"],
    when: (c) => c.edits.canUndo,
    run: (c) => c.edits.undo(),
  });
  r.register({
    id: "edit.redo",
    label: { key: "cmd.redo" },
    defaultKeys: ["Mod+Shift+Z", "Mod+Y"],
    when: (c) => c.edits.canRedo,
    run: (c) => c.edits.redo(),
  });
  r.register({
    id: "edit.rotateCW",
    label: { key: "cmd.rotate" },
    defaultKeys: ["R"],
    when: (c) => c.selectedParts().length > 0,
    // EDT-21: around the selection's center (a lone part turns about its own middle).
    run: (c) => c.edits.edit({ key: "edit.rotate" }, (d) => rotateSelection(d, c.store.get().selection, terminalsOf, true)),
  });
  r.register({
    id: "edit.delete",
    label: { key: "cmd.delete" },
    defaultKeys: ["Delete", "Backspace"],
    when: (c) => c.store.get().selection.length > 0,
    run: (c) => {
      const sel = new Set(c.store.get().selection);
      c.edits.edit({ key: "edit.delete" }, (d) => {
        for (const id of sel) {
          delete d.parts[id];
          delete d.wires[id];
          delete d.probes[id];
        }
        for (const [pid, p] of Object.entries(d.probes)) {
          const t = p.target;
          if (("part" in t && sel.has(t.part)) || ("wire" in t && sel.has(t.wire))) delete d.probes[pid];
        }
      });
      c.store.set({ selection: [] });
    },
  });
  r.register({ id: "tool.select", label: { key: "tool.select" }, run: (c) => c.setTool({ id: "select" }) });
  r.register({ id: "tool.wire", label: { key: "tool.wire" }, defaultKeys: ["W"], run: (c) => c.setTool({ id: "wire" }) });
  r.register({ id: "tool.probe", label: { key: "tool.probe" }, defaultKeys: ["P"], run: (c) => c.setTool({ id: "probe-v" }) });
  r.register({ id: "view.fit", label: { key: "cmd.fit" }, defaultKeys: ["F"], run: (c) => c.fit() });
}
