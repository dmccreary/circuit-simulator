import { partValueFromDisplay, type LessonContext } from "@cs/lesson";
import { MEASUREMENTS } from "@cs/history";
import type { AppController } from "../controller";

/** The lesson's read-only view of the controller (embedding-lessons-xapi.md §4.3). */
export function lessonContext(c: AppController): LessonContext {
  const f = c.bus.latest;
  const compiled = c.compiled;
  return {
    doc: c.edits.doc,
    compiled,
    terminals: (p) => c.resolver.terminals(p),
    partValue: (id, q) => partValueFromDisplay(compiled, f?.display, id, q),
    probeValue: (id) => c.bus.lastValue(c.channelId(id)),
    measure: (id, kind, over) => {
      const fn = MEASUREMENTS[kind];
      const t1 = f?.t1;
      if (!fn || t1 === undefined) return undefined;
      try {
        const v = c.history.view(c.channelId(id), over === undefined ? 0 : Math.max(0, t1 - over), t1);
        const r = fn(v.times(), v.values());
        return r.ok ? r.value : undefined;
      } catch {
        return undefined;
      }
    },
    diagnostics: c.store.get().diagnostics,
    simTime: f?.t1 ?? 0,
    runState: c.store.get().runState,
  };
}
