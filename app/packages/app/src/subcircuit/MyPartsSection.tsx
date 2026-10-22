import { useEffect, type DragEvent } from "react";
import { Button } from "react-aria-components";
import { useController, useDocument } from "../ui/context";
import { useStore } from "../store";
import { t } from "../messages";
import { subcircuitsOf } from "./session";
import { MY_PART_MIME, placeMyPart } from "./install";
import "./subcircuit.css";


/** The My parts palette category (EDT-35): saved subcircuits, plus those in this circuit. */
export function MyPartsSection() {
  const c = useController();
  const s = subcircuitsOf(c);
  const stored = useStore(s.ui, (u) => u.myParts);
  const inDoc = useDocument((d) => d.subcircuits);
  useEffect(() => {
    void s.loadMyParts();
  }, [s]);
  if (!c.commands.allowed("subcircuit.make")) return null;

  const storedIds = new Set((stored ?? []).map((r) => r.id));
  const entries = [
    ...(stored ?? []).map((r) => ({ id: r.id, name: r.name, saved: true })),
    ...Object.values(inDoc)
      .filter((d) => !storedIds.has(d.id) && !d.readOnly)
      .map((d) => ({ id: d.id, name: d.name, saved: false })),
  ];
  const onDragStart = (id: string) => (e: DragEvent) => {
    e.dataTransfer.setData(MY_PART_MIME, id);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <section className="my-parts">
      <h3>{t("cat.myParts")}</h3>
      {!entries.length ? (
        <p className="hint">{t("myParts.hint")}</p>
      ) : (
        <ul>
          {entries.map((e) => (
            <li key={e.id} draggable onDragStart={onDragStart(e.id)}>
              <Button className="part-btn" onPress={() => placeMyPart(c, e.id)} data-my-part={e.id}>
                {e.name || e.id}
                {!e.saved && <span className="tag"> · {t("myParts.inCircuit")}</span>}
              </Button>
              {e.saved && (
                <button className="remove" aria-label={t({ key: "myParts.remove", values: { name: e.name } })} onClick={() => void s.removeMyPart(e.id)}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
