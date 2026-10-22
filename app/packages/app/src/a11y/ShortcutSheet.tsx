import { Button, Heading, Keyboard } from "react-aria-components";
import { useController } from "../ui/context";
import { isMacPlatform } from "../commands/keymap";
import { useShell } from "../layout/use-shell";
import { t } from "../messages";
import { shortcutGroups } from "./shortcut-list";

/** Body of the `?` dialog: every bound command by group. */
export function ShortcutSheet({ close }: { close: () => void }) {
  const c = useController();
  const sh = useShell();
  const groups = shortcutGroups(c.commands, isMacPlatform());
  return (
    <>
      <Heading slot="title">{t("shortcuts.title")}</Heading>
      <div className="shortcut-sheet">
        {groups.map((g) => (
          <section key={g.group}>
            <h3>{g.group}</h3>
            <table>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.label}</th>
                    <td>
                      {r.keys.map((k, i) => (
                        <Keyboard key={i} className="kbd">
                          {k}
                        </Keyboard>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <div className="files-actions">
        <Button className="btn" onPress={() => sh.ui.set({ dialog: "settings" })}>
          {t("shortcuts.customize")}
        </Button>
        <Button className="btn primary" onPress={close} autoFocus>
          {t("shortcuts.close")}
        </Button>
      </div>
    </>
  );
}
