import {
  AXIS_H,
  CrossingScanner,
  DEFAULT_LANE_HEIGHT,
  MIN_LANE_HEIGHT,
  TriggerTracker,
  cursorReadout,
  defaultChartModel,
  defaultTrigger,
  dividerAt,
  findCrossings,
  fitSpan,
  grabbedMarker,
  interpolateSamples,
  laneAt,
  laneUnits,
  layoutLanes,
  liveWindow,
  logicColumn,
  logicLevel,
  panWindow,
  resizeLanes,
  zoomWindow,
} from "../src/chart";

describe("lane layout", () => {
  test("lanes share the height above the time axis in proportion to preferred heights", () => {
    const l = layoutLanes([undefined, 240], 360 + AXIS_H);
    expect(l.axisTop).toBe(360);
    expect(l.bands.map((b) => b.height)).toEqual([120, 240]);
    expect(l.bands.map((b) => b.top)).toEqual([0, 120]);
    expect(l.scale).toBeCloseTo(1);
  });

  test("scales down when the panel is smaller than the preferred heights", () => {
    const l = layoutLanes([DEFAULT_LANE_HEIGHT, DEFAULT_LANE_HEIGHT], 120 + AXIS_H);
    expect(l.bands.map((b) => b.height)).toEqual([60, 60]);
    expect(l.scale).toBeCloseTo(0.5);
  });

  test("laneAt and dividerAt", () => {
    const l = layoutLanes([100, 100, 100], 300 + AXIS_H);
    expect(laneAt(l, 50)).toBe(0);
    expect(laneAt(l, 150)).toBe(1);
    expect(laneAt(l, 310)).toBe(-1); // time axis
    expect(dividerAt(l, 102)).toBe(0);
    expect(dividerAt(l, 197)).toBe(1);
    expect(dividerAt(l, 150)).toBe(-1);
    expect(dividerAt(l, 300)).toBe(-1); // bottom edge is not a divider
  });

  test("resizing moves height between neighbours only and respects the minimum", () => {
    const l = layoutLanes([100, 100, 100], 300 + AXIS_H);
    expect(resizeLanes(l, 0, 30)).toEqual([130, 70, 100]);
    expect(resizeLanes(l, 1, -500)).toEqual([100, MIN_LANE_HEIGHT, 200 - MIN_LANE_HEIGHT]);
    // Heights are in preferred units: at half scale a 10 px drag is 20 units.
    const half = layoutLanes([100, 100], 100 + AXIS_H);
    expect(resizeLanes(half, 0, 10)).toEqual([120, 80]);
  });

  test("units: primary first, then others", () => {
    expect(laneUnits({ id: "l", unit: "V", traces: [] })).toEqual(["V"]);
    const lane = {
      id: "l",
      unit: "V",
      traces: [
        { channelId: "i", name: "I", color: "", unit: "A" },
        { channelId: "v", name: "V", color: "", unit: "V" },
      ],
    };
    expect(laneUnits(lane)).toEqual(["V", "A"]);
  });
});

describe("time window", () => {
  test("roll and sweep", () => {
    expect(liveWindow("roll", 2, 5)).toEqual({ t0: 0, t1: 5 });
    expect(liveWindow("roll", 12, 5)).toEqual({ t0: 7, t1: 12 });
    expect(liveWindow("sweep", 12, 5)).toEqual({ t0: 10, t1: 15 });
  });

  test("zoom keeps the anchor under the pointer and leaves live mode when paused", () => {
    const m = { ...defaultChartModel(), live: false };
    const p = zoomWindow(m, { t0: 0, t1: 10 }, 2, 0.5);
    expect(p.span).toBe(5);
    expect(p.start).toBeCloseTo(1); // 2 stays at 20 % of the window
    expect(p.live).toBe(false);
  });

  test("zooming a live roll window only changes the span", () => {
    expect(zoomWindow(defaultChartModel(), { t0: 0, t1: 5 }, 1, 2)).toEqual({ span: 10 });
  });

  test("pan", () => {
    expect(panWindow({ t0: 4, t1: 6 }, -1)).toEqual({ live: false, start: 3, span: 2 });
  });

  test("fit to circuit from time scales", () => {
    expect(fitSpan(undefined)).toBeUndefined();
    expect(fitSpan({ fastest: 1e-6, dominant: 1e-3, sourcePeriods: [0.02], kind: "periodic" })).toBeCloseTo(0.1); // 4 periods -> 80 ms -> 100 ms
    expect(fitSpan({ fastest: 1e-6, dominant: 1e-3, sourcePeriods: [], kind: "transient" })).toBeCloseTo(5e-3);
    expect(fitSpan({ fastest: 0, dominant: 0, sourcePeriods: [], kind: "static" })).toBeUndefined();
  });
});

const sine = (f: number, t0: number, t1: number, n: number) => {
  const times: number[] = [];
  const values: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    times.push(t);
    values.push(Math.sin(2 * Math.PI * f * t));
  }
  return { times, values };
};

describe("trigger detection", () => {
  test("rising and falling crossings are interpolated", () => {
    const times = [0, 1, 2, 3, 4];
    const values = [-1, 1, -1, 1, -1];
    expect(findCrossings(times, values, 0, "rising")).toEqual([0.5, 2.5]);
    expect(findCrossings(times, values, 0, "falling")).toEqual([1.5, 3.5]);
    expect(findCrossings(times, values, 0.5, "rising")).toEqual([0.75, 2.75]);
  });

  test("hysteresis ignores noise around the level", () => {
    const times = [0, 1, 2, 3, 4, 5, 6];
    const values = [-1, 0.1, -0.05, 0.1, 0.05, 1, 1];
    expect(findCrossings(times, values, 0, "rising")).toHaveLength(2); // noise re-triggers without hysteresis
    expect(findCrossings(times, values, 0, "rising", 0.2)).toEqual([times[0] + 1 / 1.1]);
    // ...the next crossing only counts after re-arming below -0.2
    expect(findCrossings([...times, 7, 8], [...values, -1, 1], 0, "rising", 0.2)).toHaveLength(2);
  });

  test("the scanner finds crossings that straddle two feeds and skips old samples", () => {
    const s = new CrossingScanner();
    s.configure(0, "rising");
    s.feed([0, 1], [-1, -0.5]);
    s.feed([1, 2], [-0.5, 0.5]); // t = 1 repeats and is skipped
    expect(s.crossings).toEqual([1.5]);
  });

  test("a sine wave triggers at whole periods and the window holds still", () => {
    const f = 10; // 100 ms period
    const data = sine(f, 0, 1, 2000);
    const tr = new TriggerTracker();
    const spec = { ...defaultTrigger(), channelId: "v", pre: 0 };
    const read = (t0: number, t1: number) => {
      const i = data.times.filter((t) => t < t0).length;
      const j = data.times.filter((t) => t <= t1).length;
      return { times: data.times.slice(i, j), values: data.values.slice(i, j) };
    };
    const r1 = tr.update(spec, 0.55, 0.25, read);
    expect(r1.status).toBe("triggered");
    // Newest crossing whose whole window (0.25 s) has arrived by t = 0.55 is t = 0.3.
    expect(r1.at!).toBeCloseTo(0.3, 3);
    expect(r1.window.t1 - r1.window.t0).toBeCloseTo(0.25);
    const r2 = tr.update(spec, 1, 0.25, read);
    expect(Math.abs(Math.round(r2.at! / 0.1) * 0.1 - r2.at!)).toBeLessThan(1e-3);
    expect(r2.at!).toBeGreaterThan(r1.at!);
  });

  test("auto free-runs without a trigger; normal waits", () => {
    const flat = { times: [0, 1, 2, 3], values: [0, 0, 0, 0] };
    const read = () => flat;
    const auto = new TriggerTracker().update({ ...defaultTrigger(), channelId: "v", level: 5 }, 3, 1, read);
    expect(auto.status).toBe("auto");
    const normal = new TriggerTracker().update({ ...defaultTrigger(), channelId: "v", level: 5, sweep: "normal" }, 3, 1, read);
    expect(normal.status).toBe("waiting");
  });

  test("single sweep captures once", () => {
    const data = sine(10, 0, 1, 2000);
    const read = (t0: number, t1: number) => {
      const k = data.times.map((t, i) => [t, i] as const).filter(([t]) => t >= t0 && t <= t1);
      return { times: k.map(([t]) => t), values: k.map(([, i]) => data.values[i]) };
    };
    const tr = new TriggerTracker();
    const spec = { ...defaultTrigger(), channelId: "v", sweep: "single" as const, pre: 0 };
    const first = tr.update(spec, 0.5, 0.2, read);
    expect(first.status).toBe("captured");
    expect(tr.update(spec, 0.9, 0.2, read).at).toBe(first.at);
    tr.rearm();
    expect(tr.update(spec, 0.9, 0.2, read).at).not.toBe(first.at);
  });
});

describe("cursors", () => {
  test("interpolation between samples", () => {
    const times = [0, 1, 3];
    const values = [0, 10, 30];
    expect(interpolateSamples(times, values, 0.5)).toBe(5);
    expect(interpolateSamples(times, values, 2)).toBe(20);
    expect(interpolateSamples(times, values, 3)).toBe(30);
    expect(interpolateSamples(times, values, -1)).toBeNaN();
    expect(interpolateSamples(times, values, 4)).toBeNaN();
    expect(interpolateSamples([], [], 0)).toBeNaN();
  });

  test("readout: Δt, 1/Δt and values at both cursors", () => {
    const series: Record<string, { t: number[]; v: number[] }> = { v1: { t: [0, 1, 2], v: [0, 2, 4] } };
    const r = cursorReadout({ a: 0.5, b: 1.5 }, [{ channelId: "v1", name: "V1", unit: "V" }], (id, t) =>
      interpolateSamples(series[id].t, series[id].v, t),
    );
    expect(r.dt).toBe(1);
    expect(r.freq).toBe(1);
    expect(r.rows[0]).toMatchObject({ a: 1, b: 3, delta: 2 });
    expect(cursorReadout({ a: 1, b: 1 }, [], () => 0).freq).toBeNaN();
  });

  test("grabbing the nearest marker", () => {
    const m = [
      { id: "a" as const, x: 100 },
      { id: "b" as const, x: 104 },
      { id: "playhead" as const, x: undefined },
    ];
    expect(grabbedMarker(103, m, 5)).toBe("b");
    expect(grabbedMarker(99, m, 5)).toBe("a");
    expect(grabbedMarker(200, m, 5)).toBeUndefined();
  });
});

describe("logic lanes", () => {
  test("levels", () => {
    expect(logicLevel(0)).toBe(0);
    expect(logicLevel(1)).toBe(1);
    expect(logicLevel(4.8)).toBe(1); // voltage fallback
    expect(logicLevel(0.3)).toBe(0);
    expect(logicLevel(0.5)).toBe("x"); // engine encoding: X = 0.5, Z = NaN
    expect(logicLevel(NaN)).toBe("z");
  });

  test("columns: steady level, edge, unknown, empty", () => {
    expect(logicColumn(1, 1)).toEqual({ kind: "level", level: 1 });
    expect(logicColumn(0, 1)).toEqual({ kind: "edge" });
    expect(logicColumn(NaN, NaN)).toEqual({ kind: "empty" });
    expect(logicColumn(0, 0.5)).toEqual({ kind: "level", level: "x" });
  });
});
