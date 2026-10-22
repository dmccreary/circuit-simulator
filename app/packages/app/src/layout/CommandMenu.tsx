import { Button, Keyboard, Menu, MenuItem, MenuTrigger, Popover, Separator } from "react-aria-components";
import { useApp, useController } from "../ui/context";
import { displayChord, isMacPlatform } from "../commands/keymap";
import { t } from "../messages";

/** A top-bar menu whose items are registered commands (app-shell.md §2). `null` is a separator. */
export function CommandMenu({ label, items }: { label: string; items: Array<string | null> }) {
  const c = useController();
  const theme = useApp((s) => s.theme ?? (s.dark ? "dark" : "light"));
  // Re-render when the selection changes so `when` is re-evaluated for enabled state.
  useApp((s) => s.selection);
  const mac = isMacPlatform();
  const shown = items.filter((id) => !id || c.commands.allowed(id)).filter((id, i, a) => id || (i > 0 && a[i - 1] && a.slice(i + 1).some(Boolean)));
  if (!shown.some(Boolean)) return null;
  const disabled = shown.filter((id): id is string => !!id && !c.commands.enabled(id));
  return (
    <MenuTrigger>
      <Button className="btn" aria-label={label}>
        {label} ▾
      </Button>
      <Popover className="files-layer files-popover" data-theme={theme} placement="bottom start">
        <Menu className="files-menu" disabledKeys={disabled} onAction={(id) => void c.commands.run(String(id))}>
          {shown.map((id, i) => {
            if (!id) return <Separator key={`sep${i}`} className="files-menu-sep" />;
            const cmd = c.commands.get(id);
            const key = c.commands.keysFor(id)[0];
            const text = t(cmd?.label ?? id);
            return (
              <MenuItem key={id} id={id} className="files-menu-item" textValue={text}>
                <span>{text}</span>
                {key && <Keyboard className="files-kbd">{displayChord(key, mac)}</Keyboard>}
              </MenuItem>
            );
          })}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
