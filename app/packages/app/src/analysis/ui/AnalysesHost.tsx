import { lazy, Suspense } from "react";
import { useAnalysisUi } from "./hooks";

// The panel (tables, plots, forms) loads on first open, keeping it out of the startup bundle.
const AnalysesPanel = lazy(() => import("./AnalysesPanel").then((m) => ({ default: m.AnalysesPanel })));

export function AnalysesHost() {
  const open = useAnalysisUi((u) => u.open);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <AnalysesPanel />
    </Suspense>
  );
}
