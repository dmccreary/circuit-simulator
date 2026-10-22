import type { CommandRegistry } from "./registry";
import type { AppController } from "../controller";
import { filesOf } from "../files/install";

/** File commands (FIL-04, FIL-05, FIL-13). Ctrl/Cmd+O and Ctrl/Cmd+S as the spec asks. */
export function registerFileCommands(r: CommandRegistry<AppController>): void {
  r.register({ id: "file.open", label: { key: "cmd.open" }, defaultKeys: ["Mod+O"], run: (c) => filesOf(c).open() });
  r.register({ id: "file.save", label: { key: "cmd.save" }, defaultKeys: ["Mod+S"], run: (c) => void filesOf(c).save() });
  r.register({
    id: "file.saveAs",
    label: { key: "cmd.saveAs" },
    defaultKeys: ["Mod+Shift+S"],
    run: (c) => void filesOf(c).save(true),
  });
  r.register({ id: "file.share", label: { key: "cmd.share" }, run: (c) => void filesOf(c).share() });
  r.register({
    id: "file.examples",
    label: { key: "cmd.examples" },
    run: (c) => filesOf(c).ui.set({ dialog: { kind: "examples" } }),
  });
}
