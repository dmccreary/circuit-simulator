import type { CommandRegistry } from "../commands/registry";
import type { AppController } from "../controller";
import { addMessages } from "../messages";
import { ANALYSIS_EN } from "./messages-en";
import { analysisOf } from "./session";
import { ANALYSIS_TABS, type AnalysisTab } from "./settings";

/** analysis.open [tab]: show the Analyses panel (toggles when already open with no tab given). */
export function registerAnalysisCommands(r: CommandRegistry<AppController>): void {
  addMessages(ANALYSIS_EN);
  r.register({
    id: "analysis.open",
    label: { key: "cmd.analysis.open" },
    run: (c, args) => {
      const tab = typeof args === "string" && ANALYSIS_TABS.includes(args as AnalysisTab) ? (args as AnalysisTab) : undefined;
      const s = analysisOf(c);
      if (tab) s.open(tab);
      else s.toggle();
    },
  });
}
