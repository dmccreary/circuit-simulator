import { useEffect } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useApp } from "../ui/context";
import { useShell, useShellUi } from "./use-shell";
import { LayoutManager } from "./LayoutManager";
import { NarrowBar } from "./NarrowBar";
import { AnnouncerRegion } from "../a11y/AnnouncerRegion";
import { CircuitTree } from "../a11y/CircuitTree";
import { InPlaceEditor } from "../edit/InPlaceEditor";
import { lazyPanel, preloadWhenIdle } from "../ui/lazy-panel";

// Dialogs load the first time they open (design/index.md §2 goal 4).
const SettingsDialog = lazyPanel(() => import("../settings/SettingsDialog").then((m) => m.SettingsDialog));
const ShortcutSheet = lazyPanel(() => import("../a11y/ShortcutSheet").then((m) => m.ShortcutSheet));

/**
 * Everything the shell features add to the page, mounted with one line in
 * App: layout measurement, the narrow bar, the accessible circuit tree, the
 * live region, the in-place editor, and the settings and shortcut dialogs.
 */
export function ShellLayer() {
  const sh = useShell();
  const dialog = useShellUi((s) => s.dialog);
  const sheet = useShellUi((s) => s.layout?.width === "narrow" || s.layout?.width === "medium");
  const theme = useApp((s) => s.theme ?? (s.dark ? "dark" : "light"));
  const close = () => sh.ui.set({ dialog: null });
  useEffect(() => preloadWhenIdle(SettingsDialog, ShortcutSheet), []);
  return (
    <>
      <LayoutManager />
      <NarrowBar />
      <CircuitTree />
      <AnnouncerRegion />
      <InPlaceEditor />
      <ModalOverlay className="files-layer files-overlay" data-theme={theme} isOpen={!!dialog} isDismissable onOpenChange={(open) => !open && close()}>
        {/* RSP-04: medium and narrow open dialogs as full-width sheets. */}
        <Modal className={`files-modal wide shell-modal${sheet ? " sheet" : ""}`}>
          <Dialog className="files-dialog">
            {dialog === "settings" && <SettingsDialog close={close} />}
            {dialog === "shortcuts" && <ShortcutSheet close={close} />}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
