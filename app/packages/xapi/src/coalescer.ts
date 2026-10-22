import { systemScheduler, type Scheduler } from "./types";

interface Pending<E> {
  event: E;
  first: number;
  timer: unknown;
}

export interface CoalescerOptions {
  /** Quiet time after the last event before the merged event is emitted (XAP-08: 1 s). */
  quietMs?: number;
  /** A continuous action that never pauses still emits this often. */
  maxWaitMs?: number;
  scheduler?: Scheduler;
}

/**
 * Merges bursts of events that share a key (a slider being dragged, a value
 * typed repeatedly) into one event emitted when the burst ends. Two emissions
 * for the same key are therefore never closer than `quietMs` (XAP-08).
 */
export class Coalescer<E> {
  private pending = new Map<string, Pending<E>>();
  private quietMs: number;
  private maxWaitMs: number;
  private sch: Scheduler;

  constructor(
    private emit: (event: E) => void,
    opts: CoalescerOptions = {},
  ) {
    this.quietMs = opts.quietMs ?? 1000;
    this.maxWaitMs = opts.maxWaitMs ?? 10_000;
    this.sch = opts.scheduler ?? systemScheduler;
  }

  /** `merge(earlier, later)` combines two events of one burst; default keeps the later. */
  push(key: string, event: E, merge: (earlier: E, later: E) => E = (_a, b) => b): void {
    const now = this.sch.now();
    const p = this.pending.get(key);
    if (p) this.sch.clearTimeout(p.timer);
    const next: Pending<E> = { event: p ? merge(p.event, event) : event, first: p?.first ?? now, timer: undefined };
    const wait = Math.max(0, Math.min(this.quietMs, next.first + this.maxWaitMs - now));
    next.timer = this.sch.setTimeout(() => this.flushKey(key), wait);
    this.pending.set(key, next);
  }

  flushKey(key: string): void {
    const p = this.pending.get(key);
    if (!p) return;
    this.sch.clearTimeout(p.timer);
    this.pending.delete(key);
    this.emit(p.event);
  }

  /** Emit everything still pending (page leaving, reporting turned off). */
  flush(): void {
    for (const key of [...this.pending.keys()]) this.flushKey(key);
  }

  get size(): number {
    return this.pending.size;
  }
}
