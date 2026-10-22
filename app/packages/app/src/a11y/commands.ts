import type { CommandRegistry } from "../commands/registry";
import type { AppController } from "../controller";
import { shellOf } from "../settings/install";
import type { Direction } from "./focus";
import type { MainView } from "../layout/classify";

const onCanvas = (c: AppController) => shellOf(c).focus.store.get().canvasFocused;
const focused = (c: AppController) => onCanvas(c) && !!shellOf(c).focus.focus;

/**
 * Keyboard operation of the canvas (ACC-03/04) and the help, settings and
 * view commands. Ids start with "view." or "help." so embed modes keep them.
 */
export function registerAccessCommands(r: CommandRegistry<AppController>): void {
  r.register({
    id: "view.focusNext",
    label: { key: "cmd.focusNext" },
    defaultKeys: ["Tab"],
    when: (c) => onCanvas(c) && shellOf(c).focus.canStep(1),
    run: (c) => void shellOf(c).focus.step(1),
  });
  r.register({
    id: "view.focusPrev",
    label: { key: "cmd.focusPrev" },
    defaultKeys: ["Shift+Tab"],
    when: (c) => onCanvas(c) && shellOf(c).focus.canStep(-1),
    run: (c) => void shellOf(c).focus.step(-1),
  });
  const dirs: [Direction, string][] = [
    ["left", "Left"],
    ["right", "Right"],
    ["up", "Up"],
    ["down", "Down"],
  ];
  for (const [dir, name] of dirs) {
    r.register({
      id: `view.focus${name}`,
      label: { key: `cmd.focus${name}` },
      defaultKeys: [`Alt+Arrow${name}`],
      when: focused,
      run: (c) => shellOf(c).focus.move(dir),
    });
  }
  r.register({ id: "view.nextTerminal", label: { key: "cmd.nextTerminal" }, defaultKeys: ["]"], when: focused, run: (c) => shellOf(c).focus.cycle(1) });
  r.register({ id: "view.prevTerminal", label: { key: "cmd.prevTerminal" }, defaultKeys: ["["], when: focused, run: (c) => shellOf(c).focus.cycle(-1) });
  r.register({ id: "view.inspect", label: { key: "cmd.inspect" }, defaultKeys: ["Enter"], when: focused, run: (c) => shellOf(c).focus.inspect() });
  r.register({
    id: "help.shortcuts",
    label: { key: "cmd.shortcuts" },
    defaultKeys: ["?", "Shift+?"],
    run: (c) => shellOf(c).ui.set({ dialog: "shortcuts" }),
  });
  r.register({ id: "view.settings", label: { key: "cmd.settings" }, defaultKeys: ["Mod+,"], run: (c) => shellOf(c).ui.set({ dialog: "settings" }) });
  const views: [MainView, string][] = [
    ["both", "cmd.viewBoth"],
    ["circuit", "cmd.viewCircuit"],
    ["chart", "cmd.viewChart"],
  ];
  for (const [view, key] of views) {
    r.register({
      id: `view.show${view[0].toUpperCase()}${view.slice(1)}`,
      label: { key },
      run: (c) => {
        const sh = shellOf(c);
        sh.ui.set({ view });
        sh.settings.updateLayout({ view });
      },
    });
  }
}
