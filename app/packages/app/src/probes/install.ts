// Hooks the measurement features onto a controller with one call from its
// constructor: probe flags, hover cards and pinned meters, derived segment
// current channels, probe and circuit-law tools, the multimeter, notices.

import type { AppController } from "../controller";
import { addMessages } from "../messages";
import { MEASURE_EN } from "./messages-en";
import { registerMeasureCommands } from "./commands";
import { MeasureSession } from "./session";

const sessions = new WeakMap<AppController, MeasureSession>();

export function installMeasurement(c: AppController): MeasureSession {
  addMessages(MEASURE_EN);
  const s = new MeasureSession(c);
  sessions.set(c, s);
  registerMeasureCommands(c.commands);
  // Blind traces: redraw the chart lanes when a lesson step hides or shows them.
  let blindTraces = false;
  c.store.subscribe(() => {
    const b = c.store.get().blind?.traces ?? false;
    if (b === blindTraces) return;
    blindTraces = b;
    c.chart?.setLanes(c.chartLanes());
  });
  return s;
}

/** The controller's measurement session. */
export function measureOf(c: AppController): MeasureSession {
  let s = sessions.get(c);
  if (!s) s = installMeasurement(c);
  return s;
}
