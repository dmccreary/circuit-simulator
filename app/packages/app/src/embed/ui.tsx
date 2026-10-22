import { createContext, useContext, useEffect, useState } from "react";
import { Button } from "react-aria-components";
import { useStore } from "../store";
import { t } from "../messages";
import type { EmbedRuntime, EmbedState } from "./runtime";
import type { PanelId } from "./params";
import "./embed.css";

export const EmbedContext = createContext<EmbedRuntime | null>(null);

const allState = (s: EmbedState) => s;
const noStore = { get: () => undefined, subscribe: () => () => {} };

function useEmbedState(): EmbedState | undefined {
  const rt = useContext(EmbedContext);
  return useStore<EmbedState | undefined, EmbedState | undefined>(rt?.state ?? noStore, allState as (s: EmbedState | undefined) => EmbedState | undefined);
}

/** Whether a panel is granted by the capability set; true without an embed runtime. */
export function usePanel(p: PanelId): boolean {
  const s = useEmbedState();
  return s ? s.caps.panels.includes(p) : true;
}

/** Extra class names for the shell (embedded, view-only, compact). */
export function useShellClass(): string {
  const rt = useContext(EmbedContext);
  const s = useEmbedState();
  if (!rt || !s) return "";
  return [rt.embedded ? "embedded" : "", `caps-${s.caps.edit}`, `layout-${rt.config.layout}`].filter(Boolean).join(" ");
}

const RECORDED = [
  "starting, pausing and resetting the simulation",
  "adding, deleting or rewiring parts",
  "changing values and flipping switches",
  "placing and removing probes",
];

/** EMB-03/EMB-04 controls and the XAP-03 recording indicator, shown in embeds. */
export function EmbedControls() {
  const rt = useContext(EmbedContext);
  const s = useEmbedState();
  const [showRecording, setShowRecording] = useState(false);
  const notice = s?.notice;
  useEffect(() => {
    if (!notice || !rt) return;
    const id = setTimeout(() => rt.dismissNotice(), 2500);
    return () => clearTimeout(id);
  }, [notice, rt]);
  if (!rt || !s) return null;
  if (!rt.embedded && !s.recording) return null;

  return (
    <div className="embed-bar" role="toolbar" aria-label="Embedded simulator">
      {rt.embedded && (
        <>
          <Button className="btn small" onPress={() => rt.c.commands.run("embed.resetOriginal")}>
            ⟲ {t("embed.resetOriginal")}
          </Button>
          <Button className="btn small" onPress={() => rt.c.commands.run("embed.openFull")}>
            ↗ {t("embed.openFull")}
          </Button>
        </>
      )}
      {notice && (
        <span className="embed-notice" role="status">
          {notice}
        </span>
      )}
      {s.warnings.length > 0 && (
        <span className="embed-warn" title={s.warnings.join("\n")}>
          ⚠ {s.warnings.length}
        </span>
      )}
      <span className="embed-spacer" />
      {s.recording && (
        <span className="embed-recording">
          <Button className="btn small rec" onPress={() => setShowRecording((v) => !v)} aria-expanded={showRecording}>
            ● {t("embed.recording")}
          </Button>
          {showRecording && (
            <div className="embed-recording-info" role="note">
              This page records what you do with the simulator for your teacher: {RECORDED.join(", ")}. It does not record
              anything you type unless a lesson says so.
            </div>
          )}
        </span>
      )}
    </div>
  );
}
