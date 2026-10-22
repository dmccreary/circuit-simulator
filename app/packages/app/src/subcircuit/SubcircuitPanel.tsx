import { Button } from "react-aria-components";
import { definitionOf, instancesOf, type Part } from "@cs/model";
import { useController, useDocument } from "../ui/context";
import { t } from "../messages";
import { subcircuitsOf } from "./session";
import "./subcircuit.css";

/** Inspector section for a selected subcircuit block (EDT-36–38), or Make subcircuit for a selection. */
export function SubcircuitPanel({ part }: { part?: Part }) {
  const c = useController();
  const s = subcircuitsOf(c);
  const defId = definitionOf(part);
  const def = useDocument((d) => (defId ? d.subcircuits[defId] : undefined));
  const copies = useDocument((d) => (defId ? instancesOf(d, defId).length : 0));
  if (!part) {
    if (!c.commands.enabled("subcircuit.make")) return null;
    return (
      <div className="subcircuit-panel">
        <Button className="btn" onPress={() => c.commands.run("subcircuit.make")}>
          {t("cmd.makeSubcircuit")}
        </Button>
      </div>
    );
  }
  if (!def) return null;
  return (
    <div className="subcircuit-panel">
      <p>
        <strong>{def.name}</strong> · {t({ key: "subcircuit.pins", values: { count: def.pins.length } })}
        {copies > 1 && <> · {t({ key: "subcircuit.copies", values: { count: copies } })}</>}
      </p>
      {def.sealed ? (
        <p className="hint">{t("subcircuit.sealed")}</p>
      ) : (
        <ul className="hint">
          {def.pins.map((p) => (
            <li key={p.name}>{p.name}</li>
          ))}
        </ul>
      )}
      <div className="row">
        {!def.sealed && (
          <Button className="btn primary" onPress={() => s.lookInside(part.id)}>
            {t("cmd.lookInside")}
          </Button>
        )}
        <Button className="btn" onPress={() => s.toggleSeal(def.id)}>
          {t(def.sealed ? "subcircuit.unlock" : "subcircuit.lock")}
        </Button>
        <Button className="btn" onPress={() => void s.saveToMyParts(def.id)}>
          {t("cmd.saveToMyParts")}
        </Button>
      </div>
    </div>
  );
}
