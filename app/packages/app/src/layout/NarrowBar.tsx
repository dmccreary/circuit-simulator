import { ToggleButton } from "react-aria-components";
import { useShell, useShellUi } from "./use-shell";
import { t } from "../messages";
import type { MainView } from "./classify";

const VIEWS: MainView[] = ["circuit", "chart", "both"];

/** Narrow layout controls: drawer toggles and the Circuit / Chart / Both switch (spec §5.1). */
export function NarrowBar() {
  const sh = useShell();
  const width = useShellUi((s) => s.layout?.width);
  const drawer = useShellUi((s) => s.drawer);
  const view = useShellUi((s) => s.view);
  if (width !== "narrow") return null;
  const toggle = (d: "palette" | "inspector") => sh.ui.set({ drawer: drawer === d ? null : d });
  const setView = (v: MainView) => {
    sh.ui.set({ view: v });
    sh.settings.updateLayout({ view: v });
  };
  return (
    <>
      <nav className="narrow-bar" aria-label={t("layout.view")}>
        <ToggleButton className="btn" isSelected={drawer === "palette"} onChange={() => toggle("palette")}>
          {t("layout.palette")}
        </ToggleButton>
        <span className="narrow-views" role="group" aria-label={t("layout.view")}>
          {VIEWS.map((v) => (
            <ToggleButton key={v} className="btn" isSelected={view === v} onChange={() => setView(v)}>
              {t(`layout.view.${v}`)}
            </ToggleButton>
          ))}
        </span>
        <ToggleButton className="btn" isSelected={drawer === "inspector"} onChange={() => toggle("inspector")}>
          {t("layout.inspector")}
        </ToggleButton>
      </nav>
      {drawer && <div className="drawer-scrim" aria-hidden onClick={() => sh.ui.set({ drawer: null })} />}
    </>
  );
}
