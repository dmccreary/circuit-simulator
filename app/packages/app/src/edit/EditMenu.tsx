import { CommandMenu } from "../layout/CommandMenu";
import { t } from "../messages";

const ITEMS: Array<string | null> = [
  "edit.undo",
  "edit.redo",
  null,
  "edit.cut",
  "edit.copy",
  "edit.paste",
  "edit.duplicate",
  "edit.delete",
  "edit.selectAll",
  null,
  "edit.rotateCW",
  "edit.rotateCCW",
  "edit.flipH",
  "edit.flipV",
  null,
  "edit.label",
  "edit.addSlider",
  null,
  "edit.repair",
  "edit.repairAll",
  null,
  "subcircuit.make",
  "subcircuit.lookInside",
  "subcircuit.toggleSeal",
  "subcircuit.saveToMyParts",
];

/** The Edit menu (spec §7.3–7.5); every item is a registered command. */
export function EditMenu() {
  return <CommandMenu label={t("menu.edit")} items={ITEMS} />;
}
