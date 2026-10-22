// Pending digital events ordered by (time, sequence). Cancelled events stay
// in the heap and are skipped when they reach the top (lazy deletion).

import type { Logic } from "./types";

export interface DigitalEvent {
  t: number;
  seq: number;
  driver: number;
  value: Logic;
  live: boolean;
}

const before = (a: DigitalEvent, b: DigitalEvent) => a.t < b.t || (a.t === b.t && a.seq < b.seq);

export class EventQueue {
  private heap: DigitalEvent[] = [];

  push(e: DigitalEvent): void {
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  /** Earliest live event, without removing it. */
  peek(): DigitalEvent | undefined {
    while (this.heap.length > 0 && !this.heap[0].live) this.popTop();
    return this.heap[0];
  }

  pop(): DigitalEvent | undefined {
    const top = this.peek();
    if (top) this.popTop();
    return top;
  }

  /** Live events in queue order (for snapshots). */
  live(): DigitalEvent[] {
    return this.heap.filter((e) => e.live).sort((a, b) => (before(a, b) ? -1 : 1));
  }

  clear(): void {
    this.heap = [];
  }

  private popTop(): void {
    const h = this.heap;
    const last = h.pop()!;
    if (h.length === 0) return;
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length && before(h[l], h[m])) m = l;
      if (r < h.length && before(h[r], h[m])) m = r;
      if (m === i) return;
      [h[i], h[m]] = [h[m], h[i]];
      i = m;
    }
  }
}
