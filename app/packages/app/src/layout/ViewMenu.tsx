import { CommandMenu } from "./CommandMenu";
import { t } from "../messages";

const ITEMS: Array<string | null> = ["view.showBoth", "view.showCircuit", "view.showChart", null, "view.fit", null, "view.lifelike", "view.powerView", null, "view.settings", "help.shortcuts"];

/** The View menu: circuit only, chart only or both (LAY-11), fit, settings and the shortcut list. */
export function ViewMenu() {
  return <CommandMenu label={t("menu.view")} items={ITEMS} />;
}
