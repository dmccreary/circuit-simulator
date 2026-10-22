import type { MessageRef } from "@cs/model";

/** English strings for message keys (Overview §7.2: UI text is never hard-coded in components). */
const EN: Record<string, string> = {
  "cmd.runPause": "Run / Pause",
  "cmd.run": "Run",
  "cmd.pause": "Pause",
  "cmd.step": "Step",
  "cmd.reset": "Reset",
  "cmd.undo": "Undo",
  "cmd.redo": "Redo",
  "cmd.rotate": "Rotate",
  "cmd.delete": "Delete",
  "cmd.fit": "Fit to view",
  "tool.select": "Select",
  "tool.wire": "Wire",
  "tool.probe": "Voltage probe",
  "palette.title": "Parts",
  "inspector.title": "Inspector",
  "inspector.empty": "Select a part to edit its values.",
  "chart.title": "Chart",
  "chart.empty": "Add a voltage probe (P) to plot it here.",
  "speed.label": "Speed",
  "status.paused": "Paused",
  "status.running": "Running",
  "status.stepping": "Stepping",
  "status.stopped": "Stopped",
  "cat.basic": "Basic",
  "cat.sources": "Sources",
  "cat.passive": "Passive",
  "cat.semiconductors": "Semiconductors",
  "cat.switches": "Switches",
  "cat.outputs": "Outputs",
  "cat.meters": "Meters",
  "cat.logic": "Logic",
  "cat.wiring": "Wiring",
};

export function t(m: MessageRef | string): string {
  const ref = typeof m === "string" ? { key: m } : m;
  let s = EN[ref.key] ?? ref.key;
  for (const [k, v] of Object.entries(ref.values ?? {})) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** "internalResistance" -> "Internal resistance" for props without a message yet. */
export function propLabel(key: string): string {
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
