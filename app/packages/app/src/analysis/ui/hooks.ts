import { useCallback } from "react";
import { themeFor, type Theme } from "@cs/render";
import { useApp, useController, useDocument } from "../../ui/context";
import { useStore } from "../../store";
import { analysisOf, type AnalysisSession, type AnalysisUi } from "../session";
import { patchSettings, settingsOf, DEFAULTS } from "../settings";

export function useSession(): AnalysisSession {
  return analysisOf(useController());
}

export function useAnalysisUi<S>(select: (s: AnalysisUi) => S): S {
  return useStore(useSession().ui, select);
}

export function useTheme(): Theme {
  const dark = useApp((s) => s.dark);
  return themeFor(dark);
}

type Key = keyof typeof DEFAULTS;

/** A tab's settings from the document, and a setter that records a (coalesced) document edit. */
export function useSettings<K extends Key>(key: K): [(typeof DEFAULTS)[K], (patch: Partial<(typeof DEFAULTS)[K]>) => void] {
  const c = useController();
  const raw = useDocument((d) => d.analyses?.[key]);
  void raw; // re-render when this tab's settings change
  const value = settingsOf(c.edits.doc, key);
  const set = useCallback(
    (patch: Partial<(typeof DEFAULTS)[K]>) => c.edits.edit({ key: "analysis.settings" }, (d) => patchSettings(d, key, patch), { coalesceKey: `analysis.${key}` }),
    [c, key],
  );
  return [value, set];
}
