import { newId, type PropValue } from "@cs/model";
import { addVoltageProbe } from "../tools/probe";
import { sourceIdFor, type EmbedRuntime } from "./runtime";

export const PROTOCOL = "circuit-simulator";
export const PROTOCOL_VERSION = 1;

/** embedding-lessons-xapi.md §3.1: one envelope in both directions. */
export interface BridgeMessage<T extends string = string, P = unknown> {
  protocol: typeof PROTOCOL;
  version: typeof PROTOCOL_VERSION;
  embedId: string;
  type: T;
  requestId?: string;
  payload: P;
}

export type OutgoingType = "ready" | "preferredHeight" | "runStateChanged" | "circuitChanged" | "lessonProgress" | "xapiStatement" | "reply";
export const HOST_TYPES = ["loadCircuit", "setValue", "setSwitch", "run", "pause", "reset", "step", "addProbe", "configureXapi", "getState"] as const;
export type HostType = (typeof HOST_TYPES)[number];

export interface PostTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface BridgeEnv {
  /** window.parent, or null when not framed. */
  parent: PostTarget | null;
  /** The parent's origin recorded at start-up; undefined when it cannot be determined. */
  parentOrigin: string | undefined;
  ownOrigin: string;
  /** Extra trusted host origins (the `allow` parameter). */
  allow: string[];
  listen(fn: (e: { source: unknown; origin: string; data: unknown }) => void): () => void;
}

export interface BridgeHooks {
  configureXapi?: (payload: unknown) => boolean;
  /** Load a circuit from a payload ({ text, name? } | { url } | { example } | { c }); resolves to success. */
  loadCircuit?: (payload: Record<string, unknown>) => Promise<boolean>;
}

/**
 * The parent page's origin (§3.2): `location.ancestorOrigins` where the
 * browser provides it, otherwise the referrer's origin.
 */
export function resolveParentOrigin(loc: { ancestorOrigins?: { length: number; [i: number]: string } }, referrer: string): string | undefined {
  if (loc.ancestorOrigins && loc.ancestorOrigins.length > 0) return loc.ancestorOrigins[0];
  try {
    return referrer ? new URL(referrer).origin : undefined;
  } catch {
    return undefined;
  }
}

/** Same origin as the simulator, or listed in `allow` (EMB-12). */
export function isTrustedOrigin(origin: string | undefined, ownOrigin: string, allow: string[]): boolean {
  if (!origin || origin === "null") return false;
  return origin === ownOrigin || allow.includes(origin);
}

/** Validates the envelope; anything malformed yields undefined (ignored without error). */
export function parseEnvelope(data: unknown, embedId: string): BridgeMessage<HostType, Record<string, unknown>> | undefined {
  if (!data || typeof data !== "object") return undefined;
  const m = data as Record<string, unknown>;
  if (m.protocol !== PROTOCOL || m.version !== PROTOCOL_VERSION) return undefined;
  if (typeof m.type !== "string" || !(HOST_TYPES as readonly string[]).includes(m.type)) return undefined;
  // A host may address one embed by id, or all embeds in a frame with "*".
  if (m.embedId !== undefined && m.embedId !== embedId && m.embedId !== "*") return undefined;
  if (m.requestId !== undefined && (typeof m.requestId !== "string" || m.requestId.length > 100)) return undefined;
  const payload = m.payload ?? {};
  if (typeof payload !== "object" || Array.isArray(payload) || payload === null) return undefined;
  return { protocol: PROTOCOL, version: PROTOCOL_VERSION, embedId, type: m.type as HostType, requestId: m.requestId as string | undefined, payload: payload as Record<string, unknown> };
}

class BridgeError extends Error {}

/**
 * The postMessage channel to the embedding page (EMB-10..12). Host commands
 * run through the command registry and the capability set like any reader
 * action, so a host cannot make a view embed edit its circuit.
 */
export class HostBridge {
  readonly trusted: boolean;
  private disposers: Array<() => void> = [];

  constructor(
    private rt: EmbedRuntime,
    private env: BridgeEnv,
    private hooks: BridgeHooks = {},
  ) {
    this.trusted = !!env.parent && isTrustedOrigin(env.parentOrigin, env.ownOrigin, env.allow);
    if (!this.trusted) return;
    this.disposers.push(env.listen((e) => this.receive(e)));
    let lastRun = rt.c.store.get().runState;
    this.disposers.push(
      rt.c.store.subscribe(() => {
        const s = rt.c.store.get().runState;
        if (s !== lastRun) {
          lastRun = s;
          this.post("runStateChanged", { runState: s });
        }
      }),
      rt.onChange((ch) => {
        this.post("circuitChanged", { source: ch.source, changes: ch.patches.length });
        if (ch.patches.some((p) => p.path[0] === "lanes" || p.path.length === 0)) this.postHeight();
      }),
    );
  }

  get embedId(): string {
    return this.rt.config.id;
  }

  post(type: OutgoingType, payload: unknown, requestId?: string): void {
    if (!this.trusted || !this.env.parent || !this.env.parentOrigin) return;
    const msg: BridgeMessage = { protocol: PROTOCOL, version: PROTOCOL_VERSION, embedId: this.embedId, type, payload, ...(requestId ? { requestId } : {}) };
    // Never "*": circuit data only goes to the recorded parent origin.
    this.env.parent.postMessage(msg, this.env.parentOrigin);
  }

  private lastHeight = 0;
  postHeight(): void {
    const height = this.rt.preferredHeight();
    if (height === this.lastHeight) return;
    this.lastHeight = height;
    this.post("preferredHeight", { height });
  }

  ready(): void {
    this.post("ready", { mode: this.rt.config.mode, edit: this.rt.caps.edit, panels: this.rt.caps.panels, xapi: this.rt.config.xapi });
    this.postHeight();
  }

  /** Entry point for a raw message event; public for tests. */
  receive(e: { source: unknown; origin: string; data: unknown }): void {
    if (e.source !== this.env.parent || e.origin !== this.env.parentOrigin) return;
    const msg = parseEnvelope(e.data, this.embedId);
    if (!msg) return;
    void this.dispatch(msg).then(
      (result) => msg.requestId && this.post("reply", { ok: true, type: msg.type, result }, msg.requestId),
      (err: unknown) => msg.requestId && this.post("reply", { ok: false, type: msg.type, error: err instanceof BridgeError ? err.message : "failed" }, msg.requestId),
    );
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }

  private async dispatch(m: BridgeMessage<HostType, Record<string, unknown>>): Promise<unknown> {
    const rt = this.rt;
    const c = rt.c;
    const p = m.payload;
    switch (m.type) {
      case "run":
        if (c.store.get().runState !== "running") this.command("sim.runPause");
        return undefined;
      case "pause":
        if (c.store.get().runState === "running") this.command("sim.runPause");
        return undefined;
      case "reset":
        if (p.original === true) return void this.command("embed.resetOriginal");
        return void this.command("sim.reset");
      case "step":
        return void this.command("sim.step");
      case "setValue":
        return this.setValue(str(p.part, "part"), str(p.prop, "prop"), p.value);
      case "setSwitch": {
        const id = this.partId(str(p.part, "part"));
        if (typeof p.closed !== "boolean") throw new BridgeError("closed must be true or false");
        const props = c.edits.doc.parts[id].props;
        return this.setValue(id, "closed" in props ? "closed" : "pressed", p.closed);
      }
      case "addProbe": {
        if (!rt.caps.tools.includes("probe-v")) throw new BridgeError("probes are not allowed in this mode");
        const id = this.partId(str(p.part, "part"));
        const probeId = newId("P");
        rt.asTrusted(() => c.edits.edit({ key: "probe.add" }, (d) => addVoltageProbe(d, { kind: "across", part: id }, probeId, newId("L"))));
        return { probe: probeId };
      }
      case "loadCircuit": {
        if (!this.hooks.loadCircuit) throw new BridgeError("loading is not available");
        const previous = rt.sourceId;
        rt.sourceId = sourceIdFor({ example: optStr(p.example), circuit: optStr(p.url), c: optStr(p.c) }, typeof p.name === "string" ? p.name : "inline");
        if (!(await this.hooks.loadCircuit(p))) {
          rt.sourceId = previous;
          throw new BridgeError("the circuit could not be loaded");
        }
        this.postHeight();
        return { title: c.edits.doc.meta.title };
      }
      case "configureXapi":
        if (!this.hooks.configureXapi?.(p)) throw new BridgeError("xAPI reporting needs xapi=1 in the embed URL and a valid configuration");
        return { recording: true };
      case "getState":
        return this.state();
    }
  }

  private command(id: string): void {
    if (!this.rt.c.commands.run(id)) throw new BridgeError(`${id} is not available`);
  }

  /** A part by id or label. */
  private partId(ref: string): string {
    const parts = this.rt.c.edits.doc.parts;
    if (parts[ref]) return ref;
    const hit = Object.values(parts).find((x) => x.label === ref);
    if (!hit) throw new BridgeError(`no part ${ref}`);
    return hit.id;
  }

  private setValue(partRef: string, prop: string, value: unknown): void {
    const rt = this.rt;
    if (rt.caps.edit === "none") throw new BridgeError("this embed is view-only");
    const id = this.partId(partRef);
    const part = rt.c.edits.doc.parts[id];
    if (!(prop in part.props)) throw new BridgeError(`${part.label || id} has no property ${prop}`);
    const old = part.props[prop];
    if (typeof value !== typeof old || (typeof value === "number" && !Number.isFinite(value))) throw new BridgeError(`${prop} expects a ${typeof old}`);
    // The host is the page author, so host input may drive locked parts (§3.2).
    rt.asTrusted(() =>
      rt.c.edits.edit({ key: "edit.setValue", values: { prop } }, (d) => {
        d.parts[id].props[prop] = value as PropValue;
      }),
    );
  }

  private state() {
    const c = this.rt.c;
    const doc = c.edits.doc;
    return {
      runState: c.store.get().runState,
      time: c.bus.latest?.t1 ?? 0,
      circuit: doc,
      probes: Object.values(doc.probes).map((pr) => ({ id: pr.id, name: pr.name, quantity: pr.quantity, value: c.bus.lastValue(c.channelId(pr.id)) ?? null })),
    };
  }
}

const optStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v) throw new BridgeError(`${name} must be a non-empty string`);
  return v;
}

/** Wire a bridge to the real window. */
export function windowBridgeEnv(win: Window, allow: string[]): BridgeEnv {
  const framed = win.parent && win.parent !== win;
  const loc = win.location as Location & { ancestorOrigins?: DOMStringList };
  return {
    parent: framed ? (win.parent as PostTarget) : null,
    parentOrigin: framed ? resolveParentOrigin(loc, win.document.referrer) : undefined,
    ownOrigin: loc.origin,
    allow,
    listen(fn) {
      const h = (e: MessageEvent) => fn({ source: e.source, origin: e.origin, data: e.data });
      win.addEventListener("message", h);
      return () => win.removeEventListener("message", h);
    },
  };
}
