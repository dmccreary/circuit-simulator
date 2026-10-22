import { Button } from "react-aria-components";
import { t } from "../../messages";
import type { AnalysisTab } from "../settings";
import { useAnalysisUi, useSession } from "./hooks";

/** Run / Cancel, progress (ANL-20), and the tab's error or cancelled notice. */
export function RunBar({ tab, auto }: { tab: AnalysisTab; auto?: boolean }) {
  const s = useSession();
  const st = useAnalysisUi((u) => u.tabs[tab]);
  const running = st.status === "running";
  return (
    <div className="an-runbar">
      {running ? (
        <>
          <progress max={1} value={st.progress} aria-label={t({ key: "analysis.running", values: { pct: Math.round(st.progress * 100) } })} />
          <span>{t({ key: "analysis.running", values: { pct: Math.round(st.progress * 100) } })}</span>
          <Button className="btn" onPress={() => s.cancel(tab)}>
            {t("analysis.cancel")}
          </Button>
        </>
      ) : (
        <Button className="btn primary" onPress={() => s.run(tab, true)}>
          {auto ? t("analysis.rerun") : t("analysis.run")}
        </Button>
      )}
      {st.status === "cancelled" && <span className="an-note">{t("analysis.cancelled")}</span>}
      {st.status === "error" && st.error && (
        <span className="an-note an-error" role="alert">
          {t(st.error)}
        </span>
      )}
    </div>
  );
}
