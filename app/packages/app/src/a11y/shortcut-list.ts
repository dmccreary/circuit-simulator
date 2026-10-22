import type { CommandRegistry } from "../commands/registry";
import { displayChord } from "../commands/keymap";
import { t } from "../messages";
import { lookup } from "../i18n";

export interface ShortcutRow {
  id: string;
  label: string;
  keys: string[];
}

export interface ShortcutGroup {
  group: string;
  rows: ShortcutRow[];
}

/** The `?` sheet, generated from the registry so it always matches the live key map (SET-06). */
export function shortcutGroups<C>(r: CommandRegistry<C>, mac: boolean, opts: { all?: boolean } = {}): ShortcutGroup[] {
  const by = new Map<string, ShortcutRow[]>();
  for (const cmd of r.list()) {
    if (!r.allowed(cmd.id)) continue;
    const keys = r.keysFor(cmd.id).map((k) => displayChord(k, mac));
    if (!keys.length && !opts.all) continue;
    const g = cmd.id.split(".")[0];
    const list = by.get(g) ?? [];
    list.push({ id: cmd.id, label: t(cmd.label), keys });
    by.set(g, list);
  }
  return [...by].map(([g, rows]) => ({ group: lookup(`shortcuts.group.${g}`) ?? g, rows }));
}
