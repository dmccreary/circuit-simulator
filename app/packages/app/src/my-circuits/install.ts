// Hooks My circuits onto a controller (called from files/install.ts).

import type { AppController } from "../controller";
import { addMessages } from "../messages";
import { filesOf } from "../files/install";
import { MY_CIRCUITS_EN } from "./messages-en";
import { myCircuitsOf } from "./session";

export function installMyCircuits(c: AppController): void {
  addMessages(MY_CIRCUITS_EN);
  c.commands.register({
    id: "file.saveToMyCircuits",
    label: { key: "cmd.saveToMyCircuits" },
    run: (ctx) => void myCircuitsOf(ctx).saveCurrent(),
  });
  c.commands.register({
    id: "file.myCircuits",
    label: { key: "cmd.myCircuits" },
    run: (ctx) => filesOf(ctx).ui.set({ dialog: { kind: "myCircuits" } }),
  });
}
