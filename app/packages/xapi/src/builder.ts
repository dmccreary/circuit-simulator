import type { Activity, Actor, Result, Statement } from "./types";
import { ACTIVITY_TYPE, VERBS, ext, type VerbName } from "./verbs";
import { activityId, isoDuration, pageAddress, uuid } from "./ids";

export interface BuilderContext {
  actor: Actor;
  /** Address of the page that embeds the simulator. */
  page: string;
  embedId: string;
  /** Circuit file name or title, or the lesson id. */
  circuitId: string;
  circuitName?: string;
  mode: string;
  now?: () => number;
  newId?: () => string;
}

export interface PartRef {
  id: string;
  label: string;
  type: string;
}

export type SimAction = "run" | "pause" | "reset" | "step";

/**
 * Turns learner events into statements (spec Section 21.2). Pure: no DOM, no
 * network; the reporter queues what it returns.
 */
export class StatementBuilder {
  constructor(private ctx: BuilderContext) {}

  setActor(actor: Actor): void {
    this.ctx = { ...this.ctx, actor };
  }

  setCircuit(circuitId: string, circuitName?: string): void {
    this.ctx = { ...this.ctx, circuitId, circuitName };
  }

  /** The circuit or lesson as a whole. */
  rootActivity(): Activity {
    return {
      objectType: "Activity",
      id: activityId(this.ctx.page, this.ctx.embedId, this.ctx.circuitId),
      definition: { name: { "en-US": this.ctx.circuitName || this.ctx.circuitId }, type: ACTIVITY_TYPE.simulation },
    };
  }

  private sub(name: string, ...path: string[]): Activity {
    return {
      objectType: "Activity",
      id: activityId(this.ctx.page, this.ctx.embedId, this.ctx.circuitId, ...path),
      definition: { name: { "en-US": name }, type: ACTIVITY_TYPE.interaction },
    };
  }

  build(verb: VerbName, object: Activity, result?: Result, extensions: Record<string, unknown> = {}): Statement {
    const root = this.rootActivity();
    const s: Statement = {
      id: (this.ctx.newId ?? uuid)(),
      actor: this.ctx.actor,
      verb: VERBS[verb],
      object,
      context: {
        extensions: {
          [ext("embed-id")]: this.ctx.embedId,
          [ext("page")]: pageAddress(this.ctx.page),
          [ext("mode")]: this.ctx.mode,
          ...extensions,
        },
        ...(object.id !== root.id ? { contextActivities: { parent: [{ id: root.id, objectType: "Activity" as const }] } } : {}),
      },
      timestamp: new Date((this.ctx.now ?? Date.now)()).toISOString(),
    };
    if (result) s.result = result;
    return s;
  }

  launched(): Statement {
    return this.build("launched", this.rootActivity());
  }

  initialized(): Statement {
    return this.build("initialized", this.rootActivity());
  }

  simulation(action: SimAction, simTime: number): Statement {
    return this.build("interacted", this.rootActivity(), {
      extensions: { [ext("action")]: action, [ext("sim-time")]: simTime },
    });
  }

  part(action: "added" | "deleted" | "rewired", p: PartRef, connections?: string[]): Statement {
    return this.build("interacted", this.sub(p.label || p.id, "part", p.label || p.id), {
      extensions: {
        [ext("action")]: action,
        [ext("part-type")]: p.type,
        [ext("label")]: p.label,
        ...(connections ? { [ext("connections")]: connections } : {}),
      },
    });
  }

  valueChanged(p: PartRef, prop: string, oldValue: unknown, newValue: unknown, via: "typed" | "slider" | "host" = "typed"): Statement {
    return this.build("interacted", this.sub(`${p.label || p.id}.${prop}`, "part", p.label || p.id, "prop", prop), {
      response: String(newValue),
      extensions: { [ext("action")]: "set-value", [ext("old-value")]: oldValue, [ext("new-value")]: newValue, [ext("via")]: via },
    });
  }

  switchFlipped(p: PartRef, state: string): Statement {
    return this.build("interacted", this.sub(p.label || p.id, "part", p.label || p.id), {
      response: state,
      extensions: { [ext("action")]: "flip", [ext("part-type")]: p.type, [ext("state")]: state },
    });
  }

  probe(action: "placed" | "removed", probe: { id: string; name: string; quantity: string; target: unknown }): Statement {
    return this.build("interacted", this.sub(probe.name || probe.id, "probe", probe.id), {
      extensions: { [ext("action")]: action, [ext("quantity")]: probe.quantity, [ext("target")]: probe.target },
    });
  }

  analysis(kind: string, settings: unknown): Statement {
    return this.build("experienced", this.sub(kind, "analysis", kind), {
      extensions: { [ext("analysis")]: kind, [ext("settings")]: settings },
    });
  }

  terminated(activeMs: number, verb: "terminated" | "suspended" = "terminated"): Statement {
    return this.build(verb, this.rootActivity(), { duration: isoDuration(activeMs) });
  }
}
