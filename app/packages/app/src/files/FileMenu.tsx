import { Button, Keyboard, Menu, MenuItem, MenuTrigger, Popover, Separator } from "react-aria-components";
import { useApp, useController } from "../ui/context";
import { displayChord, isMacPlatform } from "../commands/keymap";
import { t } from "../messages";

const ITEMS: Array<string | null> = ["file.open", "file.examples", null, "file.save", "file.saveAs", null, "file.share"];

/** The File menu in the top bar; every item is a registered command. */
export function FileMenu() {
  const c = useController();
  const dark = useApp((s) => s.dark);
  const mac = isMacPlatform();
  // Embeds may withhold file commands (embed capability gate); drop separators at the ends.
  const items = ITEMS.filter((id) => !id || c.commands.allowed(id)).filter((id, i, a) => id || (i > 0 && a[i - 1] && a.slice(i + 1).some(Boolean)));
  if (!items.some(Boolean)) return null;
  return (
    <MenuTrigger>
      <Button className="btn" aria-label={t("menu.file")}>
        {t("menu.file")} ▾
      </Button>
      <Popover className="files-layer files-popover" data-theme={dark ? "dark" : "light"} placement="bottom start">
        <Menu className="files-menu" onAction={(id) => void c.commands.run(String(id))}>
          {items.map((id, i) => {
            if (!id) return <Separator key={`sep${i}`} className="files-menu-sep" />;
            const cmd = c.commands.get(id);
            const key = c.commands.keysFor(id)[0];
            return (
              <MenuItem key={id} id={id} className="files-menu-item" textValue={t(cmd?.label ?? id)}>
                <span>{t(cmd?.label ?? id)}</span>
                {key && <Keyboard className="files-kbd">{displayChord(key, mac)}</Keyboard>}
              </MenuItem>
            );
          })}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
