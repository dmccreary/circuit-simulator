import { Button, Dialog, Heading, Input, Label, Modal, ModalOverlay, TextField } from "react-aria-components";
import { useState } from "react";
import type { PinSide } from "@cs/model";
import { useApp, useController } from "../ui/context";
import { useStore } from "../store";
import { t } from "../messages";
import { subcircuitsOf, type ProposedPin, type SubcircuitSession } from "./session";
import "../files/files.css";
import "./subcircuit.css";

/** Breadcrumb trail shown above the canvas while looking inside (EDT-36): "Circuit › U1 Filter". */
export function SubcircuitBar() {
  const c = useController();
  const s = subcircuitsOf(c);
  const path = useStore(s.ui, (u) => u.path);
  if (!path.length) return null;
  const doc = c.edits.doc;
  return (
    <nav className="subcircuit-bar" aria-label={t("subcircuit.breadcrumbs")}>
      <Button className="btn sm" onPress={() => s.exit()} aria-keyshortcuts="Escape">
        ← {t("subcircuit.back")}
      </Button>
      <ol>
        <li>
          <Button className="crumb" onPress={() => s.goTo(0)}>
            {t("subcircuit.top")}
          </Button>
        </li>
        {path.map((f, i) => (
          <li key={`${i}:${f.instance}`}>
            <span aria-hidden>›</span>
            {i === path.length - 1 ? (
              <span aria-current="page">
                {f.label} {doc.subcircuits[f.definition]?.name ?? ""}
              </span>
            ) : (
              <Button className="crumb" onPress={() => s.goTo(i + 1)}>
                {f.label} {doc.subcircuits[f.definition]?.name ?? ""}
              </Button>
            )}
          </li>
        ))}
      </ol>
      <span className="hint">{t({ key: "subcircuit.inside", values: { label: path[path.length - 1].label } })}</span>
    </nav>
  );
}

/** The make-subcircuit and edit-scope dialogs. */
export function SubcircuitHost() {
  const c = useController();
  const s = subcircuitsOf(c);
  const dialog = useStore(s.ui, (u) => u.dialog);
  const dark = useApp((st) => st.dark);
  return (
    <ModalOverlay
      className="files-layer files-overlay"
      data-theme={dark ? "dark" : "light"}
      isOpen={!!dialog}
      isDismissable
      onOpenChange={(open) => !open && (dialog?.kind === "scope" ? s.chooseScope("cancel") : s.ui.set({ dialog: null }))}
    >
      <Modal className="files-modal">
        <Dialog className="files-dialog">
          {dialog?.kind === "make" && <MakeBody s={s} ids={dialog.ids} name={dialog.name} pins={dialog.pins} />}
          {dialog?.kind === "scope" && (
            <>
              <Heading slot="title">{t("subcircuit.scopeTitle")}</Heading>
              <p>{t({ key: "subcircuit.scopeBody", values: { copies: dialog.copies } })}</p>
              <div className="files-actions">
                <Button className="btn" onPress={() => s.chooseScope("cancel")}>
                  {t("files.cancel")}
                </Button>
                <Button className="btn" onPress={() => s.chooseScope("one")}>
                  {t("subcircuit.scopeOne")}
                </Button>
                <Button className="btn primary" onPress={() => s.chooseScope("all")} autoFocus>
                  {t("subcircuit.scopeAll")}
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

const SIDES: PinSide[] = ["left", "right", "top", "bottom"];

function MakeBody({ s, ids, name: initialName, pins: proposed }: { s: SubcircuitSession; ids: string[]; name: string; pins: ProposedPin[] }) {
  const [name, setName] = useState(initialName);
  const [pins, setPins] = useState(proposed);
  const setPin = (i: number, patch: Partial<ProposedPin>) => setPins((list) => list.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const create = () => {
    s.ui.set({ dialog: null });
    s.make(ids, name.trim() || t("subcircuit.defaultName"), pins);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <Heading slot="title">{t("subcircuit.makeTitle")}</Heading>
      <p>{t("subcircuit.makeBody")}</p>
      <TextField className="field subcircuit-field" value={name} onChange={setName} autoFocus>
        <Label>{t("subcircuit.blockName")}</Label>
        <Input />
      </TextField>
      {!pins.length && <p className="hint">{t("subcircuit.noPins")}</p>}
      <ul className="subcircuit-pins">
        {pins.map((p, i) => (
          <li key={i}>
            <TextField className="field subcircuit-field" value={p.name} onChange={(v) => setPin(i, { name: v })}>
              <Label>{t({ key: "subcircuit.pinName", values: { n: i + 1 } })}</Label>
              <Input />
            </TextField>
            <label className="field subcircuit-field">
              {t("subcircuit.pinSide")}
              <select value={p.side} onChange={(e) => setPin(i, { side: e.target.value as PinSide })}>
                {SIDES.map((side) => (
                  <option key={side} value={side}>
                    {t(`subcircuit.side.${side}`)}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
      <div className="files-actions">
        <Button className="btn" onPress={() => s.ui.set({ dialog: null })}>
          {t("files.cancel")}
        </Button>
        <Button className="btn primary" type="submit">
          {t("subcircuit.create")}
        </Button>
      </div>
    </form>
  );
}
