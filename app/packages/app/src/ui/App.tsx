import { useEffect } from "react";
import { ControllerContext, useApp } from "./context";
import type { AppController } from "../controller";
import { TopBar } from "./TopBar";
import { Palette } from "./Palette";
import { SchematicView } from "./SchematicView";
import { ChartPanel } from "./ChartPanel";
import { Inspector } from "./Inspector";
import { isTypingTarget } from "../commands/registry";
import { FilesHost } from "../files/FilesHost";
import { SubcircuitBar, SubcircuitHost } from "../subcircuit/SubcircuitHost";
import { UpdateNotice } from "../offline/UpdateNotice";
import { ShellLayer } from "../layout/ShellLayer";
import { Splitter } from "../layout/Splitter";
import { AnalysesHost } from "../analysis/ui/AnalysesHost";
import { MeasureLayer } from "../meters/MeasureLayer";
import { LessonSlot } from "../lesson/slot";
import { EmbedContext, EmbedControls, usePanel, useShellClass } from "../embed/ui";
import type { EmbedRuntime } from "../embed/runtime";
import type { MessageRef } from "@cs/model";
import { t } from "../messages";

function Shell({ c }: { c: AppController }) {
  const dark = useApp((s) => s.dark);
  const theme = useApp((s) => s.theme) ?? (dark ? "dark" : "light");
  const error = useApp((s) => s.workerError);
  const diagnostics = useApp((s) => s.diagnostics);
  // Panels the capability set grants (embed `mode`/`panels`; app-shell.md §6).
  const shellClass = useShellClass();
  const show = { topbar: usePanel("topbar"), palette: usePanel("palette"), chart: usePanel("chart"), inspector: usePanel("inspector"), status: usePanel("status") };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // Buttons handle their own Space/Enter.
      if ((e.key === " " || e.key === "Enter") && (e.target as HTMLElement)?.tagName === "BUTTON") return;
      const handled = c.tools.key(e) || c.commands.handleKey(e) !== undefined;
      if (handled) e.preventDefault();
    };
    // Hidden tabs and embeds scrolled out of view stop drawing and pause the worker (EMB-07).
    let onScreen = true;
    const onVis = () => c.setVisible(onScreen && document.visibilityState === "visible");
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((es) => {
            onScreen = es.some((e) => e.isIntersecting);
            onVis();
          })
        : undefined;
    const root = document.querySelector(".shell");
    if (io && root) io.observe(root);
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
    };
  }, [c]);

  return (
    <div className={`shell ${shellClass}`.trim()} data-theme={theme}>
      <EmbedControls />
      {show.topbar && <TopBar />}
      <div className="main">
        <LessonSlot />
        {show.palette && <Palette />}
        {show.palette && <Splitter which="palette" />}
        <div className="center">
          <SubcircuitBar />
          <SchematicView />
          {show.chart && <Splitter which="chart" />}
          {show.chart && <ChartPanel />}
        </div>
        {show.inspector && <Splitter which="inspector" />}
        {show.inspector && <Inspector />}
      </div>
      {show.status && (
        <footer className="status" role="status">
          {error ? <span className="error">{error}</span> : diagnostics.length ? statusText(diagnostics) : "Ready"}
        </footer>
      )}
      <FilesHost />
      <SubcircuitHost />
      <UpdateNotice />
      <ShellLayer />
      <AnalysesHost />
      <MeasureLayer />
    </div>
  );
}

export function App({ controller, embed }: { controller: AppController; embed?: EmbedRuntime }) {
  return (
    <ControllerContext.Provider value={controller}>
      <EmbedContext.Provider value={embed ?? null}>
        <Shell c={controller} />
      </EmbedContext.Provider>
    </ControllerContext.Provider>
  );
}

/** The most severe diagnostic's text, plus how many more there are. */
function statusText(list: readonly { severity: string; message: MessageRef }[]): string {
  const rank = { error: 0, warning: 1, info: 2 } as Record<string, number>;
  const first = [...list].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3))[0];
  return list.length > 1 ? `${t(first.message)} (+${list.length - 1} more)` : t(first.message);
}
