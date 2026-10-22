import { useRef, useState, type KeyboardEvent } from "react";
import { Button, Keyboard } from "react-aria-components";
import { useController } from "../ui/context";
import { chordFromEvent, displayChord } from "../commands/keymap";
import { useShell } from "../layout/use-shell";
import { useStore } from "../store";
import { t } from "../messages";
import { shortcutGroups } from "../a11y/shortcut-list";
import { assignKey, conflictsFor, resetKeys } from "./keymap";

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS", "CapsLock"]);

/** Remappable shortcuts with conflict reporting and Restore defaults (SET-06). */
export function KeymapEditor() {
  const c = useController();
  const sh = useShell();
  const mac = sh.settings.mac;
  const keymap = useStore(sh.settings.store, (s) => s.keymap);
  const [capturing, setCapturing] = useState<string | null>(null);
  // Enter or Space captured as a shortcut must not also press the button and restart capture.
  const justCaptured = useRef(false);
  const [pending, setPending] = useState<{ id: string; chord: string; others: string[] } | null>(null);
  const groups = shortcutGroups(c.commands, mac, { all: true });
  void keymap; // re-render when the map changes

  const save = (next: Record<string, string[]>) => sh.settings.update({ keymap: next });
  const capture = (id: string) => (e: KeyboardEvent) => {
    if (capturing !== id) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return setCapturing(null);
    if (MODIFIER_KEYS.has(e.key)) return;
    const chord = chordFromEvent(e.nativeEvent);
    justCaptured.current = true;
    setCapturing(null);
    const others = conflictsFor(c.commands, chord, id, mac);
    if (others.length) setPending({ id, chord, others });
    else save(assignKey(c.commands, sh.settings.get().keymap, id, chord, mac, false));
  };
  const label = (id: string) => t(c.commands.get(id)?.label ?? id);

  return (
    <div className="keymap">
      {pending && (
        <div className="keymap-conflict" role="alert">
          <p>
            {t({
              key: "settings.keys.conflict",
              values: { chord: displayChord(pending.chord, mac), other: pending.others.map(label).join(", ") },
            })}
          </p>
          <Button
            className="btn primary"
            onPress={() => {
              save(assignKey(c.commands, sh.settings.get().keymap, pending.id, pending.chord, mac, true));
              setPending(null);
            }}
          >
            {t("settings.keys.replace")}
          </Button>{" "}
          <Button className="btn" onPress={() => setPending(null)}>
            {t("settings.keys.keepBoth")}
          </Button>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.group}>
          <h3>{g.group}</h3>
          <table>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.label}</th>
                  <td>
                    {r.keys.length ? r.keys.map((k, i) => <Keyboard key={i} className="kbd">{k}</Keyboard>) : <span className="hint">{t("shortcuts.none")}</span>}
                  </td>
                  <td className="keymap-actions">
                    <Button
                      className="btn small"
                      aria-label={`${t("settings.keys.change")}: ${r.label}`}
                      onPress={() => {
                        if (justCaptured.current) justCaptured.current = false;
                        else setCapturing(r.id);
                      }}
                      onKeyDown={capture(r.id)}
                    >
                      {capturing === r.id ? t("settings.keys.press") : t("settings.keys.change")}
                    </Button>
                    {keymap[r.id] && (
                      <Button className="btn small" onPress={() => save(resetKeys(sh.settings.get().keymap, r.id))}>
                        {t("settings.keys.reset")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <Button className="btn" onPress={() => save(resetKeys(keymap))}>
        {t("settings.keys.resetAll")}
      </Button>
    </div>
  );
}
