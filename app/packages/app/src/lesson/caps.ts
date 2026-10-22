import type { BlindItem, Permissions } from "@cs/lesson";
import type { Capabilities, ToolId } from "../embed/capabilities";
import type { PanelId } from "../embed/params";

/**
 * A step's permissions as a capability set (app-shell.md §6): the lesson
 * reuses the embed machinery, so the gate, the palette and the lock guard
 * all work the same way as in an embed (LES-01, LES-03).
 */
export function lessonCapabilities(base: Capabilities, p: Permissions, blind: readonly BlindItem[] = []): Capabilities {
  const edit = p.edit ?? base.edit;
  const tools: ToolId[] = p.tools ? [...p.tools] : edit === "full" ? base.tools : edit === "values" ? ["select", "probe-v"] : ["select"];
  if (!tools.includes("select")) tools.unshift("select");
  let panels: PanelId[] = p.panels ? [...p.panels] : [...base.panels];
  if (edit !== "full" || (Array.isArray(p.palette) && p.palette.length === 0)) panels = panels.filter((x) => x !== "palette");
  else if (p.palette && !panels.includes("palette")) panels.push("palette");
  if (blind.includes("traces")) panels = panels.filter((x) => x !== "chart");
  return {
    edit,
    palette: p.palette ?? base.palette,
    tools,
    panels,
    analyses: edit === "none" ? "none" : base.analyses,
    chartVisible: panels.includes("chart"),
    lockedParts: p.locked ?? base.lockedParts,
    hidden: { readouts: blind.includes("readouts"), traces: blind.includes("traces"), animation: blind.includes("animation") },
  };
}

/** Commands refused while a prediction is pending (LES-03). */
export const RUN_COMMANDS = new Set(["sim.runPause", "sim.step"]);
