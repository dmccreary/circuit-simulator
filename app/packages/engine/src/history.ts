// Full-state history ring (simulation-engine.md §7.4, CHT-23): the display
// state of each of the last N accepted steps, in single precision.
// TODO: above the memory budget, switch to checkpoints + re-simulation (option C).

export class HistoryRing {
  private data: Float32Array;
  private times: Float64Array;
  private start = 0;
  private count = 0;
  readonly capacity: number;

  constructor(readonly width: number, capacity: number) {
    this.capacity = Math.max(1, capacity);
    this.data = new Float32Array(this.capacity * width);
    this.times = new Float64Array(this.capacity);
  }

  get size(): number {
    return this.count;
  }

  private phys(i: number): number {
    return (this.start + i) % this.capacity;
  }

  timeAt(i: number): number {
    return this.times[this.phys(i)];
  }

  get oldest(): number {
    return this.count > 0 ? this.timeAt(0) : NaN;
  }

  get newest(): number {
    return this.count > 0 ? this.timeAt(this.count - 1) : NaN;
  }

  push(t: number, display: Float64Array): void {
    let slot: number;
    if (this.count < this.capacity) {
      slot = this.phys(this.count);
      this.count++;
    } else {
      slot = this.start;
      this.start = (this.start + 1) % this.capacity;
    }
    this.times[slot] = t;
    this.data.set(display.subarray(0, this.width), slot * this.width);
  }

  /** Index of the last entry with time <= t, or -1. */
  private indexAtOrBefore(t: number): number {
    let lo = 0;
    let hi = this.count - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.timeAt(mid) <= t) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  /** The stored state at the latest step at or before t; null outside the stored range. */
  stateAt(t: number): Float32Array | null {
    if (this.count === 0 || t < this.oldest || t > this.newest) return null;
    const i = this.indexAtOrBefore(t);
    if (i < 0) return null;
    const p = this.phys(i);
    return this.data.slice(p * this.width, (p + 1) * this.width);
  }

  /** Drop every entry later than t. */
  truncateAfter(t: number): void {
    const i = this.indexAtOrBefore(t);
    this.count = i + 1;
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
  }
}
