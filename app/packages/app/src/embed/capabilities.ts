import type { CircuitDocument, Patch } from "@cs/model";
import type { Command } from "../commands/registry";
import { ALL_PANELS, type EmbedConfig, type PanelId } from "./params";

export type ToolId = "select" | "wire" | "probe-v" | "place";

/** app-shell.md §6: the one set the shell consults to decide what to show. */
export interface Capabilities {
  edit: "full" | "values" | "none";
  palette: "all" | string[];
  tools: ToolId[];
  panels: PanelId[];
  analyses: string[] | "none";
  chartVisible: boolean;
  /** Part ids or labels, or "all". */
  lockedParts: string[] | "all";
  hidden?: { readouts: boolean; traces: boolean; animation: boolean };
}

export const FULL_CAPABILITIES: Capabilities = {
  edit: "full",
  palette: "all",
  tools: ["select", "wire", "probe-v", "place"],
  panels: [...ALL_PANELS],
  analyses: [],
  chartVisible: true,
  lockedParts: [],
};

/** Panels a mode shows when the URL does not list them. */
const MODE_PANELS: Record<Capabilities["edit"], PanelId[]> = {
  full: ALL_PANELS,
  values: ["topbar", "inspector", "chart", "status"],
  none: ["topbar", "chart", "status"],
};

/** Modes are preset capability sets; `panels` and `lock` then narrow them (embedding-lessons-xapi.md §2.2). */
export function capabilitiesFor(cfg: Pick<EmbedConfig, "mode" | "panels" | "lock">): Capabilities {
  const edit: Capabilities["edit"] = cfg.mode === "view" ? "none" : cfg.mode === "run" ? "values" : "full";
  const tools: ToolId[] = edit === "full" ? FULL_CAPABILITIES.tools : edit === "values" ? ["select", "probe-v"] : ["select"];
  const preset = MODE_PANELS[edit];
  const panels = cfg.panels ? preset.filter((p) => cfg.panels!.includes(p)) : [...preset];
  return {
    edit,
    palette: edit === "full" ? "all" : [],
    tools,
    panels,
    analyses: edit === "none" ? "none" : [],
    chartVisible: panels.includes("chart"),
    lockedParts: cfg.lock,
  };
}

/** A command's required capability: its own `capability`, else inferred from its id prefix. */
export function commandCapability(cmd: Pick<Command<unknown>, "id"> & { capability?: string }): string | undefined {
  if (cmd.capability) return cmd.capability;
  const id = cmd.id;
  if (id.startsWith("sim.") || id.startsWith("view.") || id.startsWith("embed.") || id.startsWith("help.")) return undefined;
  if (id === "edit.undo" || id === "edit.redo") return "edit.values";
  if (id === "tool.select") return "tool:select";
  if (id === "tool.wire") return "tool:wire";
  if (id === "tool.probe" || id.startsWith("probe.")) return "tool:probe-v";
  if (id.startsWith("chart.")) return "panel:chart";
  if (id.startsWith("analysis.")) return "analysis";
  if (id.startsWith("file.") || id.startsWith("files.")) return "files";
  return "edit.full";
}

/** Whether a capability string is granted. Unknown strings are refused outside full edit. */
export function granted(caps: Capabilities, cap: string | undefined): boolean {
  if (!cap) return true;
  if (cap === "edit.full" || cap === "files") return caps.edit === "full";
  if (cap === "edit.values") return caps.edit !== "none";
  if (cap === "analysis") return caps.analyses !== "none";
  if (cap.startsWith("tool:")) return caps.tools.includes(cap.slice(5) as ToolId);
  if (cap.startsWith("panel:")) return caps.panels.includes(cap.slice(6) as PanelId);
  return caps.edit === "full";
}

/** Props that operate a control rather than edit it; allowed on locked parts in run and edit modes. */
const OPERATE_PROPS = new Set(["closed", "pressed", "position"]);

export function isLocked(caps: Capabilities, doc: CircuitDocument, partId: string): boolean {
  const p = doc.parts[partId];
  if (p?.locked) return true;
  if (caps.lockedParts === "all") return true;
  return caps.lockedParts.includes(partId) || (!!p?.label && caps.lockedParts.includes(p.label));
}

/**
 * Whether a committed document change is allowed by the capability set
 * (EMB-02): view changes nothing, run changes only values of unlocked parts
 * and probes, edit is limited only by locks. `doc` is the document before the
 * change.
 */
export function patchAllowed(caps: Capabilities, patch: Patch, doc: CircuitDocument): boolean {
  const [root, id, field, key] = patch.path as (string | number)[];
  if (root === "view") return true;
  if (caps.edit === "none") return false;
  if (root === "probes" || root === "lanes" || root === "mathTraces") return caps.edit === "full" || caps.tools.includes("probe-v");
  if (root === "parts" && typeof id === "string" && doc.parts[id]) {
    const valueChange = field === "props" && typeof key === "string";
    if (valueChange && OPERATE_PROPS.has(key)) return true;
    if (isLocked(caps, doc, id)) return false;
    return caps.edit === "full" || valueChange;
  }
  return caps.edit === "full";
}
