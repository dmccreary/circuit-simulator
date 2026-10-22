import { Button } from "react-aria-components";
import { allDescriptors, type ElementDescriptor } from "@cs/elements";
import { useApp, useController } from "./context";
import { t } from "../messages";
import { usePaletteFilter } from "../embed/use-palette";
import { MyPartsSection } from "../subcircuit/MyPartsSection";

/** Parts grouped by category, Essentials first (CMP-01, CMP-02). */
export function Palette() {
  const c = useController();
  const tool = useApp((s) => s.tool);
  const offered = usePaletteFilter();
  const groups = new Map<string, ElementDescriptor[]>();
  for (const d of allDescriptors()) {
    if (!offered(d.type)) continue;
    const list = groups.get(d.category) ?? [];
    list.push(d);
    groups.set(d.category, list);
  }
  return (
    <nav className="palette" aria-label={t("palette.title")}>
      <h2>{t("palette.title")}</h2>
      {[...groups].map(([cat, list]) => (
        <section key={cat}>
          <h3>{t(`cat.${cat}`)}</h3>
          <ul>
            {list.map((d) => (
              <li key={d.type}>
                <Button
                  className={`part-btn${tool.id === "place" && tool.type === d.type ? " active" : ""}`}
                  onPress={(e) => (e.pointerType === "keyboard" ? c.commands.run("edit.placeAtCenter", d.type) : c.setTool({ id: "place", type: d.type }))}
                  data-part-type={d.type}
                >
                  {d.type.replace(/-/g, " ")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <MyPartsSection />
    </nav>
  );
}
