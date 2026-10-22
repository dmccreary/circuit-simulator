import { useEffect } from "react";
import { ControllerContext, useApp } from "./context";
import type { AppController } from "../controller";
import { TopBar } from "./TopBar";
import { Palette } from "./Palette";
import { SchematicView } from "./SchematicView";
import { ChartPanel } from "./ChartPanel";
import { Inspector } from "./Inspector";
import { isTypingTarget } from "../commands/registry";

function Shell({ c }: { c: AppController }) {
  const dark = useApp((s) => s.dark);
  const error = useApp((s) => s.workerError);
  const diagnostics = useApp((s) => s.diagnostics);

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
    <div className="shell" data-theme={dark ? "dark" : "light"}>
      <TopBar />
      <div className="main">
        <Palette />
        <div className="center">
          <SchematicView />
          <ChartPanel />
        </div>
        <Inspector />
      </div>
      <footer className="status" role="status">
        {error ? <span className="error">{error}</span> : diagnostics.length ? `${diagnostics.length} warning(s)` : "Ready"}
      </footer>
    </div>
  );
}

export function App({ controller }: { controller: AppController }) {
  return (
    <ControllerContext.Provider value={controller}>
      <Shell c={controller} />
    </ControllerContext.Provider>
  );
}
