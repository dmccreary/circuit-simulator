// The History Store (history-and-analysis.md §2).

import type { MessageRef } from "@cs/model";
import type { Frame, SimEvent } from "@cs/worker";
import {
  CHUNK,
  CHUNK_BITS,
  LEVELS,
  blockBits,
  newTimeColumn,
  newValueColumn,
  type Series,
  type TimeColumn,
  type ValueColumn,
} from "./columns";
import { lowerBound, stepAt, timeAt, valueAtIndex } from "./query";
import { createTraceView, type TraceView } from "./view";

export type TraceId = string;
export type GhostId = string;

export interface GhostInfo {
  id: GhostId;
  trace: TraceId;
  label: MessageRef;
}

export interface HistoryStoreOptions {
  /** Raw samples kept per trace before the oldest chunks are dropped (PRF-04: at least 100,000). */
  maxSamples?: number;
  /** Ghosts kept per trace (CHT-17). */
  maxGhostsPerTrace?: number;
}

export interface HistoryStore {
  /** Append one frame's samples (called by the Frame Bus). */
  append(frame: Frame): void;
  /** A read-only view of a trace or ghost between two times. */
  view(trace: TraceId | GhostId, t0: number, t1: number): TraceView;
  /** Keep a copy of the trace as a ghost (CHT-17). Shares raw storage with the trace. */
  keepGhost(trace: TraceId, label: MessageRef): GhostId;
  ghosts(trace?: TraceId): GhostInfo[];
  dropGhost(id: GhostId): void;
  /** Events for markers on the time axis (CHT-24). */
  events(t0: number, t1: number): SimEvent[];
  /** Discard history after a time (Restart from here, CHT-22). */
  truncateAfter(t: number): void;
  /** Discard all history (Reset, SIM-03). Ghosts are kept. */
  clear(): void;
  channels(): TraceId[];
  /** Total samples appended (including dropped ones). */
  readonly length: number;
  /** First and last time held, or null when empty. */
  timeRange(): { t0: number; t1: number } | null;
}

export function createHistoryStore(opts: HistoryStoreOptions = {}): HistoryStore {
  const maxSamples = Math.max(CHUNK, opts.maxSamples ?? 500_000);
  const maxGhosts = opts.maxGhostsPerTrace ?? 8;

  let time: TimeColumn = newTimeColumn();
  let cols = new Map<TraceId, ValueColumn>();
  let eventLog: SimEvent[] = [];
  const ghostList: (GhostInfo & { series: Series })[] = [];
  let ghostSeq = 0;

  const emptySeries = (): Series => ({ time, values: newValueColumn() });

  function column(id: TraceId): ValueColumn {
    let c = cols.get(id);
    if (!c) {
      c = newValueColumn();
      cols.set(id, c);
    }
    return c;
  }

  function writeSample(c: ValueColumn, i: number, v: number, dt: number) {
    const k = i >> CHUNK_BITS;
    let chunk = c.chunks[k];
    if (!chunk) {
      // New chunk, or a channel that appeared mid-run: earlier samples read as NaN.
      chunk = new Float32Array(CHUNK).fill(NaN);
      c.chunks[k] = chunk;
    }
    chunk[i & (CHUNK - 1)] = v;
    c.pyr.add(i, v, dt);
  }

  function writeTime(i: number, t: number) {
    const k = i >> CHUNK_BITS;
    let chunk = time.chunks[k];
    if (!chunk) {
      chunk = new Float64Array(CHUNK);
      time.chunks[k] = chunk;
    }
    chunk[i & (CHUNK - 1)] = t;
    for (let l = 0; l < LEVELS; l++) {
      const bits = blockBits(l + 1);
      const b = i >> bits;
      time.tFirst[l].ensure(b + 1);
      time.tLast[l].ensure(b + 1);
      if ((i & ((1 << bits) - 1)) === 0) time.tFirst[l].a[b] = t;
      time.tLast[l].a[b] = t;
    }
  }

  function evict() {
    while (time.length - time.first - CHUNK >= maxSamples) {
      const k = time.first >> CHUNK_BITS;
      time.chunks[k] = undefined;
      for (const c of cols.values()) c.chunks[k] = undefined;
      time.first += CHUNK;
    }
  }

  function append(frame: Frame) {
    const n = frame.times.length;
    if (n > 0 && time.length > 0 && frame.times[0] <= timeAt(time, time.length - 1)) {
      // Time went backwards (a restart the caller did not announce): keep only the earlier history.
      truncateBefore(frame.times[0]);
    }
    const ids = frame.channelIds;
    const seen = new Set<string>();
    const start = time.length;
    for (let j = 0; j < n; j++) writeTime(start + j, frame.times[j]);
    time.length = start + n;
    const dts = new Float64Array(n);
    for (let j = 0; j < n; j++) dts[j] = stepAt(time, start + j);
    ids.forEach((id, c) => {
      seen.add(id);
      const col = column(id);
      for (let j = 0; j < n; j++) writeSample(col, start + j, frame.samples[c * n + j], dts[j]);
    });
    for (const [id, col] of cols) {
      if (seen.has(id)) continue;
      for (let j = 0; j < n; j++) writeSample(col, start + j, NaN, dts[j]);
    }
    for (const e of frame.events) eventLog.push(e);
    evict();
  }

  /** Keep samples with time < t. */
  function truncateBefore(t: number) {
    setLength(lowerBound(time, t));
    eventLog = eventLog.filter((e) => e.t < t);
  }

  function setLength(len: number) {
    if (len >= time.length) return;
    const k = len >> CHUNK_BITS;
    const offset = len & (CHUNK - 1);
    // Copy the chunk that will be written again, so ghosts keep the old samples.
    const keep = offset ? k + 1 : k;
    if (offset && time.chunks[k]) time.chunks[k] = time.chunks[k]!.slice();
    time.chunks.length = Math.min(time.chunks.length, keep);
    for (const c of cols.values()) {
      if (offset && c.chunks[k]) c.chunks[k] = c.chunks[k]!.slice();
      c.chunks.length = Math.min(c.chunks.length, keep);
    }
    time.length = len;
    if (time.first > len) time.first = len - (len & (CHUNK - 1));
    rebuildTail(len);
  }

  /** Recompute the partial last block of every level after a truncation. */
  function rebuildTail(len: number) {
    const pyrs = [...cols.values()].map((c) => c.pyr);
    for (let l = 0; l < LEVELS; l++) {
      const bits = blockBits(l + 1);
      const size = 1 << bits;
      const full = len >> bits;
      const partial = (len & (size - 1)) !== 0;
      const count = full + (partial ? 1 : 0);
      time.tFirst[l].truncate(count);
      time.tLast[l].truncate(count);
      for (const p of pyrs) p.truncate(l, count);
      if (!partial) continue;
      const b = full;
      const startIdx = b << bits;
      if (len - 1 >= time.first) time.tLast[l].a[b] = timeAt(time, len - 1);
      for (const [, c] of cols) {
        const p = c.pyr;
        p.resetBlock(l, b);
        if (l === 0) {
          for (let i = Math.max(startIdx, time.first); i < len; i++) {
            const v = valueAtIndex({ time, values: c }, i);
            if (Number.isNaN(v)) continue;
            const dt = stepAt(time, i);
            if (v < p.min[0].a[b]) p.min[0].a[b] = v;
            if (v > p.max[0].a[b]) p.max[0].a[b] = v;
            p.sum[0].a[b] += v * dt;
            p.sumSq[0].a[b] += v * v * dt;
            p.w[0].a[b] += dt;
          }
        } else {
          const childBits = blockBits(l);
          const c0 = startIdx >> childBits;
          const c1 = (len + (1 << childBits) - 1) >> childBits;
          for (let ch = c0; ch < c1; ch++) p.mergeChild(l, b, ch);
        }
      }
    }
  }

  function seriesFor(id: string): Series {
    const g = ghostList.find((x) => x.id === id);
    if (g) return g.series;
    const c = cols.get(id);
    return c ? { time, values: c } : emptySeries();
  }

  function freezeTime(): TimeColumn {
    return {
      chunks: time.chunks.slice(),
      length: time.length,
      first: time.first,
      tFirst: time.tFirst.map((g) => g.copy()),
      tLast: time.tLast.map((g) => g.copy()),
    };
  }

  return {
    append,
    view: (trace, t0, t1) => createTraceView(trace, seriesFor(trace), t0, t1),
    keepGhost(trace, label) {
      const c = cols.get(trace) ?? newValueColumn();
      const id = `ghost:${++ghostSeq}`;
      ghostList.push({ id, trace, label, series: { time: freezeTime(), values: { chunks: c.chunks.slice(), pyr: c.pyr.copy() } } });
      const mine = ghostList.filter((g) => g.trace === trace);
      if (mine.length > maxGhosts) ghostList.splice(ghostList.indexOf(mine[0]), 1);
      return id;
    },
    ghosts: (trace) => ghostList.filter((g) => !trace || g.trace === trace).map(({ id, trace: tr, label }) => ({ id, trace: tr, label })),
    dropGhost(id) {
      const i = ghostList.findIndex((g) => g.id === id);
      if (i >= 0) ghostList.splice(i, 1);
    },
    events: (t0, t1) => eventLog.filter((e) => e.t >= t0 && e.t <= t1),
    truncateAfter(t) {
      setLength(lowerBound(time, t, true));
      eventLog = eventLog.filter((e) => e.t <= t);
    },
    clear() {
      time = newTimeColumn();
      cols = new Map();
      eventLog = [];
    },
    channels: () => [...cols.keys()],
    get length() {
      return time.length;
    },
    timeRange() {
      if (time.length === 0) return null;
      const t0 = time.first > 0 ? time.tFirst[0].a[0] : timeAt(time, 0);
      return { t0, t1: timeAt(time, time.length - 1) };
    },
  };
}
