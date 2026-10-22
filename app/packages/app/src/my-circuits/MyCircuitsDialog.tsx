import { useEffect, useState } from "react";
import { Button, Heading, Input, Label, TextField } from "react-aria-components";
import type { CircuitRecord } from "@cs/persistence";
import { useController } from "../ui/context";
import { useStore } from "../store";
import { t } from "../messages";
import { myCircuitsOf } from "./session";
import { svgDataUrl } from "./thumbnail";
import "./my-circuits.css";

/** File → My circuits (FIL-08): the circuits kept in this browser. */
export function MyCircuitsDialog({ close }: { close: () => void }) {
  const c = useController();
  const s = myCircuitsOf(c);
  const list = useStore(s.ui, (u) => u.list);
  const currentId = useStore(s.ui, (u) => u.currentId);
  const temporary = useStore(s.ui, (u) => u.temporary);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    void s.refresh();
  }, [s]);

  const open = (id: string) => {
    close();
    void s.open(id);
  };

  return (
    <>
      <Heading slot="title">{t("myCircuits.title")}</Heading>
      <p className="hint">{t(temporary ? "myCircuits.temporary" : "myCircuits.where")}</p>
      <div className="my-circuits">
        {list === null && <p className="hint">{t("files.loading")}</p>}
        {list?.length === 0 && <p className="hint">{t("myCircuits.empty")}</p>}
        <ul>
          {list?.map((rec) => (
            <li key={rec.id} className={rec.id === currentId ? "current" : undefined}>
              <Thumb rec={rec} onOpen={() => open(rec.id)} />
              <div className="my-circuits-info">
                {renaming === rec.id ? (
                  <RenameField rec={rec} done={(name) => (setRenaming(null), name !== undefined && void s.rename(rec.id, name))} />
                ) : (
                  <strong>{rec.name}</strong>
                )}
                <span className="hint">
                  {t({ key: "myCircuits.changed", values: { when: new Date(rec.changedAt).toLocaleString() } })}
                  {rec.id === currentId ? ` · ${t("myCircuits.current")}` : ""}
                </span>
                {deleting === rec.id ? (
                  <span className="my-circuits-actions" role="group" aria-label={t({ key: "myCircuits.deleteTitle", values: { name: rec.name } })}>
                    <span>{t({ key: "myCircuits.deleteTitle", values: { name: rec.name } })}</span>
                    <Button className="btn sm" onPress={() => setDeleting(null)}>
                      {t("files.cancel")}
                    </Button>
                    <Button className="btn sm danger" onPress={() => (setDeleting(null), void s.remove(rec.id))}>
                      {t("myCircuits.delete")}
                    </Button>
                  </span>
                ) : (
                  <span className="my-circuits-actions">
                    <Button className="btn sm primary" onPress={() => open(rec.id)}>
                      {t("myCircuits.open")}
                    </Button>
                    <Button className="btn sm" onPress={() => setRenaming(rec.id)}>
                      {t("myCircuits.rename")}
                    </Button>
                    <Button className="btn sm" onPress={() => void s.duplicate(rec.id)}>
                      {t("myCircuits.duplicate")}
                    </Button>
                    <Button className="btn sm" onPress={() => setDeleting(rec.id)}>
                      {t("myCircuits.delete")}
                    </Button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="files-actions">
        <Button className="btn" onPress={() => void s.saveCurrent()}>
          {t("myCircuits.saveCurrent")}
        </Button>
        <Button className="btn primary" onPress={close}>
          {t("files.close")}
        </Button>
      </div>
    </>
  );
}

function Thumb({ rec, onOpen }: { rec: CircuitRecord; onOpen: () => void }) {
  return (
    <Button className="my-circuits-thumb" onPress={onOpen} aria-label={`${t("myCircuits.open")} ${rec.name}`}>
      {rec.thumbnailSvg ? <img src={svgDataUrl(rec.thumbnailSvg)} alt={t({ key: "myCircuits.thumbnail", values: { name: rec.name } })} /> : null}
    </Button>
  );
}

function RenameField({ rec, done }: { rec: CircuitRecord; done: (name?: string) => void }) {
  const [name, setName] = useState(rec.name);
  return (
    <TextField
      className="field"
      value={name}
      onChange={setName}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === "Enter") done(name);
        if (e.key === "Escape") done();
      }}
      onBlur={() => done(name)}
    >
      <Label className="sr-only">{t("myCircuits.nameLabel")}</Label>
      <Input />
    </TextField>
  );
}
