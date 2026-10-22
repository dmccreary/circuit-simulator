import { useEffect } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { useApp, useController } from "../ui/context";
import { useStore } from "../store";
import { t } from "../messages";
import { filesOf } from "./install";
import { autosaveOf, bootFiles } from "./boot";
import { lazyPanel } from "../ui/lazy-panel";
import type { FilesDialog } from "./ui-state";
import type { FileSession } from "./session";
import "./files.css";

// Not needed at startup: its own chunk, loaded on first open.
const ExamplesDialog = lazyPanel(() => import("./ExamplesDialog").then((m) => m.ExamplesDialog));
const MyCircuitsDialog = lazyPanel(() => import("../my-circuits/MyCircuitsDialog").then((m) => m.MyCircuitsDialog));

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");

/**
 * The file layer's on-screen parts: startup (address, recovery), drag-and-drop
 * opening (FIL-04), the transient status notice, and the file dialogs.
 */
export function FilesHost() {
  const c = useController();
  const s = filesOf(c);
  const dark = useApp((st) => st.dark);
  const dialog = useStore(s.ui, (u) => u.dialog);
  const notice = useStore(s.ui, (u) => u.notice);
  const dragging = useStore(s.ui, (u) => u.dragging);

  useEffect(() => {
    void bootFiles(s, globalThis.location?.href ?? "");
  }, [s]);

  useEffect(() => {
    let depth = 0;
    // Dropping opens a file, so it follows the same capability as File → Open.
    const accepts = (e: DragEvent) => hasFiles(e) && c.commands.allowed("file.open");
    const enter = (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      depth++;
      s.ui.set({ dragging: true });
    };
    const over = (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) s.ui.set({ dragging: false });
    };
    const drop = (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      depth = 0;
      s.ui.set({ dragging: false });
      const f = e.dataTransfer?.files[0];
      if (f) void f.text().then((text) => s.openText(text, f.name));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [s, c]);

  const theme = dark ? "dark" : "light";
  const close = () => s.ui.set({ dialog: null });
  return (
    <>
      {notice && (
        <div className={`files-notice${notice.error ? " error" : ""}`} role={notice.error ? "alert" : "status"}>
          {notice.text}
        </div>
      )}
      {dragging && <div className="files-drop">{t("files.dropHere")}</div>}
      <ModalOverlay
        className="files-layer files-overlay"
        data-theme={theme}
        isOpen={!!dialog}
        isDismissable={dialog?.kind !== "confirm" && dialog?.kind !== "recovery"}
        onOpenChange={(open) => {
          if (open) return;
          if (dialog?.kind === "confirm") dialog.resolve(false);
          else close();
        }}
      >
        <Modal className={`files-modal${dialog?.kind === "examples" || dialog?.kind === "myCircuits" ? " wide" : ""}`}>
          <Dialog className="files-dialog">{dialog && <DialogBody session={s} dialog={dialog} close={close} />}</Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}

function DialogBody({ session, dialog, close }: { session: FileSession; dialog: FilesDialog; close: () => void }) {
  switch (dialog.kind) {
    case "confirm":
      return (
        <>
          <Heading slot="title">{dialog.title}</Heading>
          <p>{dialog.message}</p>
          <div className="files-actions">
            <Button className="btn" onPress={() => dialog.resolve(false)}>
              {dialog.cancel}
            </Button>
            <Button className="btn primary" onPress={() => dialog.resolve(true)} autoFocus>
              {dialog.confirm}
            </Button>
          </div>
        </>
      );
    case "notices":
      return (
        <>
          <Heading slot="title">{dialog.title}</Heading>
          <ul className="files-notices">
            {dialog.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          <div className="files-actions">
            <Button className="btn primary" onPress={close} autoFocus>
              {t("files.close")}
            </Button>
          </div>
        </>
      );
    case "link":
      return (
        <>
          <Heading slot="title">{t("files.linkTitle")}</Heading>
          <p>{t("files.linkBody")}</p>
          <textarea className="files-link" readOnly value={dialog.url} rows={4} onFocus={(e) => e.currentTarget.select()} />
          <div className="files-actions">
            <Button className="btn primary" onPress={close}>
              {t("files.close")}
            </Button>
          </div>
        </>
      );
    case "recovery":
      return <RecoveryBody session={session} entries={dialog.entries} close={close} />;
    case "examples":
      return <ExamplesDialog session={session} close={close} />;
    case "myCircuits":
      return <MyCircuitsDialog close={close} />;
  }
}

function RecoveryBody({ session, entries, close }: { session: FileSession; entries: import("@cs/persistence").RecoveryRecord[]; close: () => void }) {
  const auto = autosaveOf(session);
  const restore = async (i: number) => {
    close();
    // Entries not chosen stay stored and are offered again next time.
    await (await auto)?.restore(entries[i]);
  };
  const discard = async () => {
    close();
    await (await auto)?.discard(entries);
  };
  return (
    <>
      <Heading slot="title">{t("files.recoveryTitle")}</Heading>
      <p>{t("files.recoveryBody")}</p>
      <ul className="files-recovery">
        {entries.slice(0, 8).map((e, i) => (
          <li key={e.sessionId}>
            <span>
              <strong>{e.title || e.fileName || t("files.untitled")}</strong>{" "}
              <span className="hint">{new Date(e.changedAt).toLocaleString()}</span>
            </span>
            <Button className="btn" onPress={() => void restore(i)}>
              {t("files.restore")}
            </Button>
          </li>
        ))}
      </ul>
      <div className="files-actions">
        <Button className="btn" onPress={() => void discard()}>
          {t("files.discardAll")}
        </Button>
      </div>
    </>
  );
}
