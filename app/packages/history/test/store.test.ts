import { describe, expect, it } from "vitest";
import type { Frame, SimEvent } from "@cs/worker";
import { CHUNK, createHistoryStore } from "@cs/history";

function frame(times: number[], channels: Record<string, (t: number, i: number) => number>, events: SimEvent[] = []): Frame {
  const ids = Object.keys(channels);
  const n = times.length;
  const samples = new Float64Array(ids.length * n);
  ids.forEach((id, c) => times.forEach((t, i) => (samples[c * n + i] = channels[id](t, i))));
  return {
    frame: 0,
    t0: times[0] ?? 0,
    t1: times[n - 1] ?? 0,
    runState: "running",
    effectiveSpeed: 1,
    slowerThanRequested: false,
    channelIds: ids,
    times: Float64Array.from(times),
    samples,
    display: new Float64Array(0),
    events,
  };
}

const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
// A deterministic, spiky test signal (exactly representable in float32).
const sig = (i: number) => (((i * 7919) % 1000) - 500) / 4;

/** Append samples 0..n-1 at t = i * dt in frames of `per` samples. */
function fill(store: ReturnType<typeof createHistoryStore>, n: number, per = 1000, dt = 1e-3, ch = { a: (_t: number, i: number) => sig(i) }) {
  for (let s = 0; s < n; s += per) {
    const idx = range(s, Math.min(n, s + per));
    const f = frame(
      idx.map((i) => i * dt),
      Object.fromEntries(Object.entries(ch).map(([k, fn]) => [k, (t: number, j: number) => fn(t, idx[j])])),
    );
    store.append(f);
  }
}

describe("history store", () => {
  it("appends and views across chunk boundaries", () => {
    const h = createHistoryStore();
    fill(h, 3 * CHUNK + 100, 777);
    expect(h.length).toBe(3 * CHUNK + 100);
    const i0 = CHUNK - 10;
    const i1 = 2 * CHUNK + 10;
    const v = h.view("a", i0 * 1e-3, i1 * 1e-3);
    expect(v.length).toBe(i1 - i0 + 1);
    const vals = v.values();
    const ts = v.times();
    for (let k = 0; k < vals.length; k++) {
      expect(vals[k]).toBe(sig(i0 + k));
      expect(ts[k]).toBeCloseTo((i0 + k) * 1e-3, 12);
    }
  });

  it("interpolates valueAt", () => {
    const h = createHistoryStore();
    fill(h, 100, 100, 1, { a: (t) => 2 * t });
    const v = h.view("a", 0, 99);
    expect(v.valueAt(10.25)).toBeCloseTo(20.5, 5);
    expect(v.valueAt(42)).toBe(84);
    expect(v.valueAt(200)).toBeNaN();
  });

  it("answers minMaxBuckets like brute force", () => {
    const h = createHistoryStore();
    const n = 300_000; // spans pyramid levels 1-3
    fill(h, n, 5000);
    const v = h.view("a", 0, n);
    for (const [ta, tb, buckets] of [
      [0, (n - 1) * 1e-3, 37],
      [12.3456, 250.001, 600],
      [100, 100.5, 3],
    ] as const) {
      const r = v.minMaxBuckets(ta, tb, buckets);
      const w = (tb - ta) / buckets;
      for (let k = 0; k < buckets; k++) {
        const lo = ta + k * w;
        const hi = k === buckets - 1 ? tb : ta + (k + 1) * w;
        let mn = Infinity;
        let mx = -Infinity;
        for (let i = 0; i < n; i++) {
          const t = i * 1e-3;
          if (t >= lo && (k === buckets - 1 ? t <= hi : t < hi)) {
            mn = Math.min(mn, sig(i));
            mx = Math.max(mx, sig(i));
          }
        }
        if (mn === Infinity) {
          expect(r.min[k]).toBeNaN();
        } else {
          expect(r.min[k]).toBe(mn);
          expect(r.max[k]).toBe(mx);
        }
      }
    }
  });

  it("summarizes mean and rms from the pyramid", () => {
    const h = createHistoryStore();
    fill(h, 50_000, 4000, 1e-3, { a: (t) => 3 });
    const s = h.view("a", 0, 50).summary();
    expect(s.mean).toBeCloseTo(3, 9);
    expect(s.rms).toBeCloseTo(3, 9);
    expect(s.min).toBe(3);
  });

  it("starts channels that appear mid-run with NaN", () => {
    const h = createHistoryStore();
    fill(h, 5000, 5000);
    h.append(frame([5, 5.001], { a: () => 1, b: () => 2 }));
    const b = h.view("b", 0, 10);
    expect(b.valueAt(1)).toBeNaN();
    expect(b.valueAt(5)).toBe(2);
    expect(b.minMaxBuckets(0, 5.001, 2).min[0]).toBeNaN();
    // A channel missing from a later frame records NaN.
    h.append(frame([6], { a: () => 1 }));
    expect(h.view("b", 0, 10).valueAt(6)).toBeNaN();
  });

  it("truncates and continues appending", () => {
    const h = createHistoryStore();
    fill(h, 10_000, 1000);
    h.truncateAfter(5.0005); // keeps samples 0..5000
    expect(h.length).toBe(5001);
    h.append(frame([5.0015, 5.002], { a: () => 1000 }));
    const v = h.view("a", 0, 10);
    expect(v.length).toBe(5003);
    expect(v.valueAt(5)).toBe(sig(5000));
    const r = v.minMaxBuckets(0, 5.002, 1);
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i <= 5000; i++) {
      mn = Math.min(mn, sig(i));
      mx = Math.max(mx, sig(i));
    }
    expect(r.min[0]).toBe(mn);
    expect(r.max[0]).toBe(1000);
    expect(v.summary(0, 4.0955).max).toBe(Math.max(...range(0, 4096).map(sig)));
  });

  it("truncates events and clears", () => {
    const h = createHistoryStore();
    h.append(frame([0, 1, 2], { a: (t) => t }, [{ t: 0.5, kind: "paramChanged" }, { t: 1.5, kind: "reset" }]));
    expect(h.events(0, 2)).toHaveLength(2);
    h.truncateAfter(1);
    expect(h.events(0, 2).map((e) => e.kind)).toEqual(["paramChanged"]);
    h.clear();
    expect(h.length).toBe(0);
    expect(h.timeRange()).toBeNull();
    expect(h.view("a", 0, 1).length).toBe(0);
  });

  it("keeps ghosts that share storage and survive truncation and clear", () => {
    const h = createHistoryStore();
    fill(h, 6000, 1000);
    const g = h.keepGhost("a", { key: "ghost.label" });
    expect(h.ghosts("a")).toEqual([{ id: g, trace: "a", label: { key: "ghost.label" } }]);
    h.truncateAfter(4.5);
    h.append(frame([4.6, 4.7], { a: () => 9999 }));
    const gv = h.view(g, 0, 10);
    expect(gv.length).toBe(6000);
    expect(gv.valueAt(4.6)).toBeCloseTo(sig(4600), 6);
    expect(gv.minMaxBuckets(0, 6, 1).max[0]).toBe(Math.max(...range(0, 6000).map(sig)));
    h.clear();
    expect(h.view(g, 0, 10).valueAt(5.5)).toBeCloseTo(sig(5500), 6);
    for (let k = 0; k < 9; k++) h.keepGhost("a", { key: "g" });
    expect(h.ghosts("a")).toHaveLength(8);
  });

  it("drops old chunks past the budget but keeps their summaries", () => {
    const h = createHistoryStore({ maxSamples: 2 * CHUNK });
    const n = 10 * CHUNK;
    fill(h, n, 3000);
    const v = h.view("a", 0, n);
    expect(v.length).toBeLessThanOrEqual(3 * CHUNK);
    expect(v.length).toBeGreaterThanOrEqual(2 * CHUNK);
    expect(v.valueAt(0.5)).toBeNaN(); // raw sample dropped
    const r = v.minMaxBuckets(0, (n - 1) * 1e-3, 1);
    expect(r.min[0]).toBe(Math.min(...range(0, n).map(sig)));
    expect(r.max[0]).toBe(Math.max(...range(0, n).map(sig)));
    expect(h.timeRange()).toEqual({ t0: 0, t1: (n - 1) * 1e-3 });
  });
});
