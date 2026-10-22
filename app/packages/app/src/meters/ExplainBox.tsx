// "Explain" for the selected part (PRB-21): its law with the live numbers,
// updating while the simulation runs.

import { useController } from "../ui/context";
import { useLiveValue } from "../live";
import { t } from "../messages";
import { measureOf } from "../probes/install";
import { explainPart } from "./explain";

export function ExplainBox({ partId }: { partId: string }) {
  const c = useController();
  const s = measureOf(c);
  const text = useLiveValue(c.bus, () => {
    const live = s.live();
    const part = c.edits.doc.parts[partId];
    if (!live || !part || s.blind()) return "";
    return explainPart(live, part).join("\n");
  });
  if (!text) return null;
  return (
    <section className="explain" aria-label={t("explain.title")}>
      <h3>{t("explain.title")}</h3>
      {text.split("\n").map((line) => (
        <p key={line} className="explain-line">
          {line}
        </p>
      ))}
    </section>
  );
}
