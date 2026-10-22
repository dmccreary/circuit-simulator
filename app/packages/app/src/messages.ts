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
  "chart.mode": "Mode",
  "chart.mode.roll": "Roll",
  "chart.mode.sweep": "Sweep",
  "chart.mode.triggered": "Triggered",
  "chart.trigger": "Trigger on",
  "chart.trigger.level": "Level",
  "chart.trigger.rising": "Rising ↑",
  "chart.trigger.falling": "Falling ↓",
  "chart.trigger.auto": "Auto",
  "chart.trigger.normal": "Normal",
  "chart.trigger.single": "Single",
  "chart.trigger.rearm": "Re-arm",
  "chart.span": "Window",
  "chart.zoomIn": "Zoom in",
  "chart.zoomOut": "Zoom out",
  "chart.live": "Back to live",
  "chart.fit": "Fit to circuit",
  "chart.cursors": "Cursors",
  "chart.keep": "Keep trace",
  "chart.clearGhosts": "Clear kept traces",
  "chart.addLane": "Add lane",
  "chart.measurements": "Measurements",
  "chart.restartHere": "Restart from here",
  "chart.backToLatest": "Back to latest",
  "chart.noHistory": "Circuit history not available this far back",
  "chart.scrubbing": "Viewing t = {t}",
  "chart.ghostLabel": "{name} (kept {n})",
  "chart.lane": "Lane {n}",
  "chart.lane.kind": "Lane kind",
  "chart.lane.analog": "Analog",
  "chart.lane.logic": "Logic",
  "chart.lane.auto": "Auto",
  "chart.lane.fixed": "Fixed",
  "chart.lane.min": "Minimum",
  "chart.lane.max": "Maximum",
  "chart.lane.up": "Move lane up",
  "chart.lane.down": "Move lane down",
  "chart.lane.remove": "Remove lane",
  "chart.moveTo": "Lane for {name}",
  "chart.newLane": "New lane",
  "chart.addMeasurement": "Add measurement…",
  "chart.removeMeasurement": "Remove {name}",
  "chart.noMeasurements": "Pick a measurement to add for each probe.",
  "chart.cursor.dt": "Δt",
  "chart.cursor.freq": "1/Δt",
  "chart.editLane": "Change lane",
  "chart.resizeLane": "Resize lanes",
  "chart.editMeasurement": "Change measurements",
  "measure.noData": "no data",
  "measure.needTwoPeriods": "needs two periods",
  "measure.noFallingEdge": "no falling edge",
  "measure.noStep": "no step found",
  "measure.unknown": "unknown",
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
  let s = EN[ref.key] ?? fallback(ref);
  for (const [k, v] of Object.entries(ref.values ?? {})) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Parts without a written description read as "R1, resistor" (ACC-07). */
function fallback(ref: MessageRef): string {
  const m = /^element\.(.+)\.describe$/.exec(ref.key);
  if (!m) return ref.key;
  const name = m[1].replace(/-/g, " ");
  return ref.values?.label ? `${ref.values.label}, ${name}` : name;
}

/** Feature modules register their own English strings (existing keys win). */
export function addMessages(m: Record<string, string>): void {
  for (const [k, v] of Object.entries(m)) if (!(k in EN)) EN[k] = v;
}

/** "internalResistance" -> "Internal resistance" for props without a message yet. */
export function propLabel(key: string): string {
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
