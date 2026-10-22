import { systemScheduler, type QueueStorage, type QueuedStatement, type Scheduler, type Statement, type Transport } from "./types";

export const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export interface QueueOptions {
  transport: Transport;
  storage?: QueueStorage;
  scheduler?: Scheduler;
  /** Statements older than this are dropped unsent (XAP-06). */
  maxAgeMs?: number;
  /** Statements per transport call. */
  batchSize?: number;
  /** First retry delay; doubles per failure up to `maxBackoffMs`. */
  backoffMs?: number;
  maxBackoffMs?: number;
  /** Delay before a send, so statements are batched off the frame path (XAP-06). */
  sendDelayMs?: number;
}

export const memoryStorage = (): QueueStorage & { items: QueuedStatement[] } => {
  const s = {
    items: [] as QueuedStatement[],
    load: () => s.items.slice(),
    save: (items: QueuedStatement[]) => void (s.items = items.slice()),
  };
  return s;
};

/** Browser storage for the queue; any storage failure degrades to memory only. */
export function webStorage(key = "cs.xapiQueue", store?: Pick<Storage, "getItem" | "setItem">): QueueStorage {
  let mem: QueuedStatement[] = [];
  const get = () => store ?? (globalThis as { localStorage?: Storage }).localStorage;
  return {
    load() {
      try {
        const raw = get()?.getItem(key);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(parsed) ? (parsed as QueuedStatement[]) : mem;
      } catch {
        return mem;
      }
    },
    save(items) {
      mem = items;
      try {
        get()?.setItem(key, JSON.stringify(items));
      } catch {
        /* private mode or full: keep in memory */
      }
    },
  };
}

/**
 * The outgoing statement queue (XAP-06): statements are persisted, sent in
 * batches after a short delay, retried with exponential back-off, and dropped
 * after seven days. Sending never throws into the caller.
 */
export class StatementQueue {
  private items: QueuedStatement[];
  private timer: unknown;
  private sending = false;
  private failures = 0;
  private readonly o: Required<Omit<QueueOptions, "storage" | "scheduler">> & { storage: QueueStorage; scheduler: Scheduler };

  constructor(opts: QueueOptions) {
    this.o = {
      storage: opts.storage ?? memoryStorage(),
      scheduler: opts.scheduler ?? systemScheduler,
      maxAgeMs: SEVEN_DAYS_MS,
      batchSize: 25,
      backoffMs: 2000,
      maxBackoffMs: 5 * 60_000,
      sendDelayMs: 250,
      ...stripUndefined(opts),
    } as StatementQueue["o"];
    this.items = this.o.storage.load();
    this.prune();
    if (this.items.length) this.schedule(this.o.sendDelayMs);
  }

  get length(): number {
    return this.items.length;
  }

  pending(): Statement[] {
    return this.items.map((i) => i.statement);
  }

  setTransport(t: Transport): void {
    this.o.transport = t;
  }

  enqueue(statement: Statement): void {
    this.items.push({ statement, queuedAt: this.o.scheduler.now(), attempts: 0 });
    this.persist();
    if (!this.failures) this.schedule(this.o.sendDelayMs);
  }

  /** Try to send everything now; resolves when the attempt ends. */
  async flush(): Promise<void> {
    if (this.timer !== undefined) this.o.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
    if (this.sending) return;
    this.prune();
    this.sending = true;
    try {
      while (this.items.length) {
        const batch = this.items.slice(0, this.o.batchSize);
        try {
          await this.o.transport(batch.map((b) => b.statement));
        } catch {
          batch.forEach((b) => b.attempts++);
          this.failures++;
          this.persist();
          this.schedule(Math.min(this.o.maxBackoffMs, this.o.backoffMs * 2 ** (this.failures - 1)));
          return;
        }
        this.failures = 0;
        const sent = new Set(batch);
        this.items = this.items.filter((i) => !sent.has(i));
        this.persist();
      }
    } finally {
      this.sending = false;
    }
  }

  dispose(): void {
    if (this.timer !== undefined) this.o.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(ms: number): void {
    if (this.timer !== undefined) return;
    this.timer = this.o.scheduler.setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, ms);
  }

  private prune(): void {
    const cutoff = this.o.scheduler.now() - this.o.maxAgeMs;
    const kept = this.items.filter((i) => i.queuedAt >= cutoff);
    if (kept.length !== this.items.length) {
      this.items = kept;
      this.persist();
    }
  }

  private persist(): void {
    this.o.storage.save(this.items);
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
