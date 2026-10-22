import { Button } from "react-aria-components";
import { t } from "../../messages";
import { ANALYSIS_TABS, type AnalysisTab } from "../settings";
import { useAnalysisUi, useSession } from "./hooks";
import { DcTab } from "./DcTab";
import { AcTab } from "./AcTab";
import { DcSweepTab, ParamSweepTab } from "./SweepTabs";
import { SpectrumTab } from "./SpectrumTab";
import "../analysis.css";

const BODY: Record<AnalysisTab, () => React.JSX.Element> = { dc: DcTab, ac: AcTab, dcSweep: DcSweepTab, paramSweep: ParamSweepTab, spectrum: SpectrumTab };

/** The Analyses panel (spec §14): DC, Frequency, DC sweep, Sweep and Spectrum tabs. */
export function AnalysesPanel() {
  const s = useSession();
  const open = useAnalysisUi((u) => u.open);
  const tab = useAnalysisUi((u) => u.tab);
  if (!open) return null;
  const Body = BODY[tab];
  return (
    <section className="analyses-panel" aria-label={t("analysis.title")}>
      <header className="an-head">
        <h2>{t("analysis.title")}</h2>
        <div role="tablist" aria-label={t("analysis.title")} className="an-tabs">
          {ANALYSIS_TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === tab} className={k === tab ? "active" : undefined} onClick={() => s.setTab(k)}>
              {t(`analysis.tab.${k}`)}
            </button>
          ))}
        </div>
        <Button className="btn" onPress={() => s.close()} aria-label={t("analysis.close")}>
          ✕
        </Button>
      </header>
      <div role="tabpanel" className="an-body">
        <p className="an-scope">{t(`analysis.scope.${tab}`)}</p>
        <Body />
      </div>
    </section>
  );
}
