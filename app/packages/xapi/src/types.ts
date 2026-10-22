// xAPI 1.0.3 statement shapes, limited to what the reporter emits
// (embedding-lessons-xapi.md §5, spec Section 21).

export type LangMap = Record<string, string>;

export interface Account {
  homePage: string;
  name: string;
}

export interface Actor {
  objectType?: "Agent";
  name?: string;
  mbox?: string;
  mbox_sha1sum?: string;
  account?: Account;
}

export interface Verb {
  id: string;
  display: LangMap;
}

export interface Activity {
  objectType: "Activity";
  id: string;
  definition?: { name?: LangMap; description?: LangMap; type?: string; extensions?: Record<string, unknown> };
}

export interface Result {
  success?: boolean;
  completion?: boolean;
  response?: string;
  duration?: string;
  extensions?: Record<string, unknown>;
}

export interface Context {
  registration?: string;
  contextActivities?: { parent?: { id: string; objectType?: "Activity" }[] };
  extensions?: Record<string, unknown>;
}

export interface Statement {
  id: string;
  actor: Actor;
  verb: Verb;
  object: Activity;
  result?: Result;
  context?: Context;
  timestamp: string;
}

/** Sends statements; rejects when they could not be delivered (they are then retried). */
export type Transport = (statements: Statement[]) => Promise<void>;

/** Persists the unsent queue between page loads (XAP-06). */
export interface QueueStorage {
  load(): QueuedStatement[];
  save(items: QueuedStatement[]): void;
}

export interface QueuedStatement {
  statement: Statement;
  /** Epoch ms when first queued; items older than the max age are dropped. */
  queuedAt: number;
  attempts: number;
}

/** Clock and timer hooks, injectable for tests. */
export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};
