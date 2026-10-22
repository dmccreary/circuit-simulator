import type { CircuitDocument, Patch } from "@cs/model";
import type { PartRef, SimAction, XapiReporter } from "@cs/xapi";
import type { EmbedRuntime } from "./runtime";
import type { CommittedChange } from "./changes";

const OPERATE_PROPS = new Set(["closed", "pressed", "position"]);

const partRef = (doc: CircuitDocument, id: string): PartRef => {
  const p = doc.parts[id];
  return { id, label: p?.label ?? id, type: p?.type ?? "unknown" };
};

interface ValueEvent {
  part: PartRef;
  prop: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Feeds the xAPI reporter from the streams that already exist (§5.2):
 * executed commands and finished document changes. Live-drag patches never
 * reach it, so one slider drag is one statement (XAP-08).
 */
export function attachXapi(
  rt: EmbedRuntime,
  reporter: XapiReporter,
  opts: { now?: () => number; onLeave?: (fn: () => void) => () => void } = {},
): () => void {
  const c = rt.c;
  const now = opts.now ?? (() => Date.now());
  const started = now();
  const simTime = () => c.bus.latest?.t1 ?? 0;

  const offRun = c.commands.onRun((id, args) => {
    if (id === "sim.runPause") {
      const action: SimAction = c.store.get().runState === "running" ? "run" : "pause";
      reporter.coalesce(`sim:${action}`, action, (b, a) => b.simulation(a, simTime()));
    } else if (id === "sim.reset" || id === "embed.resetOriginal") {
      reporter.record((b) => b.simulation("reset", 0));
    } else if (id === "sim.step") {
      reporter.coalesce("sim:step", "step" as const, (b, a) => b.simulation(a, simTime()));
    } else if (id.startsWith("analysis.")) {
      reporter.record((b) => b.analysis(id.slice("analysis.".length), args ?? {}));
    }
  });

  const offChange = rt.onChange((ch) => {
    if (ch.source === "load") {
      reporter.builder.setCircuit(rt.sourceId, ch.after.meta.title);
      return;
    }
    reportChange(reporter, ch);
  });

  const offLeave = opts.onLeave?.(() => reporter.terminate(now() - started));

  return () => {
    offRun();
    offChange();
    offLeave?.();
  };
}

/** Map one finished change to statements (spec Section 21.2). */
export function reportChange(reporter: XapiReporter, ch: CommittedChange): void {
  const { before, after } = ch;
  let rewired = false;
  for (const p of ch.patches) {
    const [root, id, field, key] = p.path as (string | number)[];
    if (root === "parts" && typeof id === "string") {
      if (p.path.length === 2) {
        const action = p.op === "delete" ? "deleted" : before.parts[id] ? "rewired" : "added";
        const doc = p.op === "delete" ? before : after;
        reporter.record((b) => b.part(action, partRef(doc, id)));
      } else if (field === "props" && typeof key === "string" && p.path.length === 4) {
        const part = partRef(after, id);
        const newValue = after.parts[id]?.props[key];
        if (OPERATE_PROPS.has(key)) {
          reporter.record((b) => b.switchFlipped(part, String(newValue)));
        } else {
          const ev: ValueEvent = { part, prop: key, oldValue: before.parts[id]?.props[key], newValue };
          reporter.coalesce(
            `value:${id}:${key}`,
            ev,
            (b, e) => b.valueChanged(e.part, e.prop, e.oldValue, e.newValue),
            (a, z) => ({ ...z, oldValue: a.oldValue }),
          );
        }
      } else if (field === "at" || field === "orientation" || field === "length") {
        rewired = true;
      }
    } else if (root === "wires") {
      rewired = true;
    } else if (root === "probes" && typeof id === "string" && p.path.length === 2) {
      const probe = (p.op === "delete" ? before : after).probes[id];
      if (probe) reporter.record((b) => b.probe(p.op === "delete" ? "removed" : "placed", probe));
    }
  }
  if (rewired) {
    reporter.coalesce("rewire", touchedParts(ch.patches), (b, ids) => b.part("rewired", { id: "wiring", label: "wiring", type: "wire" }, ids), (a, z) => [...new Set([...a, ...z])]);
  }
}

function touchedParts(patches: Patch[]): string[] {
  return [...new Set(patches.filter((p) => p.path[0] === "parts" && typeof p.path[1] === "string").map((p) => p.path[1] as string))];
}
