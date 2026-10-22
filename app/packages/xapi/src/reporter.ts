import type { Actor, QueueStorage, Scheduler, Statement } from "./types";
import { StatementBuilder, type BuilderContext } from "./builder";
import { Coalescer } from "./coalescer";
import { StatementQueue } from "./queue";
import { directTransport, isAcceptableEndpoint, relayTransport } from "./transport";
import { uuid } from "./ids";

/** The `configureXapi` payload from the host (XAP-01). */
export type XapiConfig = {
  actor?: Actor;
} & ({ transport: "relay" } | { transport: "direct"; endpoint: string; auth?: string });

/** Validates an untrusted configureXapi payload; returns undefined when malformed. */
export function parseXapiConfig(p: unknown): XapiConfig | undefined {
  if (!p || typeof p !== "object") return undefined;
  const o = p as Record<string, unknown>;
  const actor = isActor(o.actor) ? (o.actor as Actor) : undefined;
  if (o.actor !== undefined && !actor) return undefined;
  if (o.transport === "relay" || o.transport === undefined) return { transport: "relay", ...(actor ? { actor } : {}) };
  if (o.transport === "direct" && typeof o.endpoint === "string" && isAcceptableEndpoint(o.endpoint)) {
    if (o.auth !== undefined && typeof o.auth !== "string") return undefined;
    return { transport: "direct", endpoint: o.endpoint, ...(o.auth ? { auth: o.auth as string } : {}), ...(actor ? { actor } : {}) };
  }
  return undefined;
}

function isActor(a: unknown): boolean {
  if (!a || typeof a !== "object") return false;
  const o = a as Record<string, unknown>;
  const acct = o.account as Record<string, unknown> | undefined;
  return (
    (typeof o.mbox === "string" && o.mbox.startsWith("mailto:")) ||
    typeof o.mbox_sha1sum === "string" ||
    (!!acct && typeof acct.homePage === "string" && typeof acct.name === "string")
  );
}

/** Anonymous per-browser actor (XAP-04). */
export function anonymousActor(homePage: string, store?: Pick<Storage, "getItem" | "setItem">): Actor {
  const key = "cs.xapiAnonymousId";
  let id: string | null = null;
  try {
    const s = store ?? (globalThis as { localStorage?: Storage }).localStorage;
    id = s?.getItem(key) ?? null;
    if (!id) {
      id = uuid();
      s?.setItem(key, id);
    }
  } catch {
    id = id ?? uuid();
  }
  return { objectType: "Agent", account: { homePage, name: id } };
}

export interface ReporterOptions {
  /** The embed URL had `xapi=1`. Without it, configureXapi is refused (XAP-01). */
  allowed: boolean;
  context: Omit<BuilderContext, "actor">;
  /** Posts a statement to the host page (relay transport). */
  relay: (s: Statement) => void;
  storage?: QueueStorage;
  scheduler?: Scheduler;
  anonymous?: () => Actor;
  fetch?: Parameters<typeof directTransport>[1];
}

interface Burst {
  event: unknown;
  make: (b: StatementBuilder, e: never) => Statement;
}

/**
 * The xAPI reporter (embedding-lessons-xapi.md §5). Off until both the URL
 * allows it and the host configures it; afterwards every learner event becomes
 * a statement, continuous actions are coalesced, and the queue delivers them.
 */
export class XapiReporter {
  readonly builder: StatementBuilder;
  private queue: StatementQueue | undefined;
  private coalescer: Coalescer<Burst>;
  private listeners = new Set<(on: boolean) => void>();
  private config: XapiConfig | undefined;

  constructor(private o: ReporterOptions) {
    this.builder = new StatementBuilder({ ...o.context, actor: { objectType: "Agent" } });
    this.coalescer = new Coalescer<Burst>((b) => this.send(b.make(this.builder, b.event as never)), { scheduler: o.scheduler });
  }

  get enabled(): boolean {
    return !!this.queue;
  }

  get transport(): XapiConfig["transport"] | undefined {
    return this.config?.transport;
  }

  onChange(fn: (on: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Apply a configureXapi payload. Returns whether reporting is now on. */
  configure(payload: unknown): boolean {
    if (!this.o.allowed) return false;
    const cfg = parseXapiConfig(payload);
    if (!cfg) return false;
    const wasOn = this.enabled;
    this.config = cfg;
    this.builder.setActor(cfg.actor ?? (this.o.anonymous ?? (() => anonymousActor(originOf(this.o.context.page))))());
    const transport = cfg.transport === "direct" ? directTransport(cfg, this.o.fetch) : relayTransport(this.o.relay);
    if (this.queue) this.queue.setTransport(transport);
    else this.queue = new StatementQueue({ transport, storage: this.o.storage, scheduler: this.o.scheduler });
    if (!wasOn) {
      this.send(this.builder.launched());
      this.send(this.builder.initialized());
      for (const l of this.listeners) l(true);
    }
    return true;
  }

  /** Record one statement now (no-op while off). */
  record(make: (b: StatementBuilder) => Statement): void {
    if (this.enabled) this.send(make(this.builder));
  }

  /** Record a continuous action; bursts with the same key become one statement (XAP-08). */
  coalesce<E>(key: string, event: E, make: (b: StatementBuilder, e: E) => Statement, merge?: (a: E, b: E) => E): void {
    if (!this.enabled) return;
    this.coalescer.push(key, { event, make } as Burst, (a, b) => ({
      event: merge ? merge(a.event as E, b.event as E) : b.event,
      make: b.make,
    }));
  }

  /** Flush pending bursts and send a terminated (or suspended) statement. */
  terminate(activeMs: number, verb: "terminated" | "suspended" = "terminated"): void {
    if (!this.enabled) return;
    this.coalescer.flush();
    this.send(this.builder.terminated(activeMs, verb));
    void this.queue?.flush();
  }

  pending(): Statement[] {
    return this.queue?.pending() ?? [];
  }

  flush(): Promise<void> {
    this.coalescer.flush();
    return this.queue?.flush() ?? Promise.resolve();
  }

  dispose(): void {
    this.queue?.dispose();
  }

  private send(s: Statement): void {
    this.queue?.enqueue(s);
  }
}

function originOf(page: string): string {
  try {
    return new URL(page).origin;
  } catch {
    return page;
  }
}
