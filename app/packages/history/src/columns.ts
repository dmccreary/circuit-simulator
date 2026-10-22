// Storage primitives for the history store (history-and-analysis.md §2.1–2.2).

export const CHUNK_BITS = 12;
export const CHUNK = 1 << CHUNK_BITS; // 4,096 samples per chunk
export const BLOCK_BITS = 6; // 64 samples (or child blocks) per summary block
export const LEVELS = 4; // block sizes 64, 4,096, 262,144, 16,777,216

export const blockBits = (level: number): number => BLOCK_BITS * level; // level is 1-based

/** A Float64Array that grows on demand; unused entries hold `fill`. */
export class Grow {
  a: Float64Array;
  n = 0;
  constructor(
    readonly fill: number,
    cap = 16,
  ) {
    this.a = new Float64Array(cap).fill(fill);
  }
  ensure(len: number): void {
    if (len > this.a.length) {
      const next = new Float64Array(Math.max(len, this.a.length * 2)).fill(this.fill);
      next.set(this.a);
      this.a = next;
    }
    if (len > this.n) this.n = len;
  }
  truncate(len: number): void {
    if (len >= this.n) return;
    this.a.fill(this.fill, len, this.n);
    this.n = len;
  }
  copy(): Grow {
    const g = new Grow(this.fill, Math.max(1, this.n));
    g.a.set(this.a.subarray(0, this.n));
    g.n = this.n;
    return g;
  }
}

/** Per-level block summaries of one value column. Sums are time-weighted. */
export class ValuePyramid {
  min: Grow[] = [];
  max: Grow[] = [];
  sum: Grow[] = [];
  sumSq: Grow[] = [];
  w: Grow[] = [];
  constructor() {
    for (let l = 0; l < LEVELS; l++) {
      this.min.push(new Grow(Infinity));
      this.max.push(new Grow(-Infinity));
      this.sum.push(new Grow(0));
      this.sumSq.push(new Grow(0));
      this.w.push(new Grow(0));
    }
  }

  add(i: number, v: number, dt: number): void {
    for (let l = 0; l < LEVELS; l++) {
      const b = i >> blockBits(l + 1);
      this.ensure(l, b + 1);
      if (Number.isNaN(v)) continue;
      if (v < this.min[l].a[b]) this.min[l].a[b] = v;
      if (v > this.max[l].a[b]) this.max[l].a[b] = v;
      this.sum[l].a[b] += v * dt;
      this.sumSq[l].a[b] += v * v * dt;
      this.w[l].a[b] += dt;
    }
  }

  ensure(l: number, len: number): void {
    this.min[l].ensure(len);
    this.max[l].ensure(len);
    this.sum[l].ensure(len);
    this.sumSq[l].ensure(len);
    this.w[l].ensure(len);
  }

  truncate(l: number, len: number): void {
    this.min[l].truncate(len);
    this.max[l].truncate(len);
    this.sum[l].truncate(len);
    this.sumSq[l].truncate(len);
    this.w[l].truncate(len);
  }

  resetBlock(l: number, b: number): void {
    this.ensure(l, b + 1);
    this.min[l].a[b] = Infinity;
    this.max[l].a[b] = -Infinity;
    this.sum[l].a[b] = 0;
    this.sumSq[l].a[b] = 0;
    this.w[l].a[b] = 0;
  }

  /** Merge block `child` of level l-1 into block `b` of level l. */
  mergeChild(l: number, b: number, child: number): void {
    const c = l - 1;
    if (this.min[c].a[child] < this.min[l].a[b]) this.min[l].a[b] = this.min[c].a[child];
    if (this.max[c].a[child] > this.max[l].a[b]) this.max[l].a[b] = this.max[c].a[child];
    this.sum[l].a[b] += this.sum[c].a[child];
    this.sumSq[l].a[b] += this.sumSq[c].a[child];
    this.w[l].a[b] += this.w[c].a[child];
  }

  copy(): ValuePyramid {
    const p = Object.create(ValuePyramid.prototype) as ValuePyramid;
    p.min = this.min.map((g) => g.copy());
    p.max = this.max.map((g) => g.copy());
    p.sum = this.sum.map((g) => g.copy());
    p.sumSq = this.sumSq.map((g) => g.copy());
    p.w = this.w.map((g) => g.copy());
    return p;
  }
}

/** Shared time column: chunks plus first/last time of every summary block. */
export interface TimeColumn {
  chunks: (Float64Array | undefined)[];
  length: number;
  /** First sample still held raw; earlier chunks were dropped by the memory budget. */
  first: number;
  tFirst: Grow[];
  tLast: Grow[];
}

export interface ValueColumn {
  chunks: (Float32Array | undefined)[];
  pyr: ValuePyramid;
}

export function newTimeColumn(): TimeColumn {
  return {
    chunks: [],
    length: 0,
    first: 0,
    tFirst: Array.from({ length: LEVELS }, () => new Grow(NaN)),
    tLast: Array.from({ length: LEVELS }, () => new Grow(NaN)),
  };
}

export const newValueColumn = (): ValueColumn => ({ chunks: [], pyr: new ValuePyramid() });

/** A frozen or live pairing of the time column with one value column. */
export interface Series {
  time: TimeColumn;
  values: ValueColumn;
}
