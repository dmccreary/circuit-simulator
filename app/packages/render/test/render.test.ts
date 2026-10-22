import { ViewTransform, PX_PER_GRID, MAX_ZOOM, MIN_ZOOM } from "../src/transform";
import { HitIndex, hitTolerance } from "../src/hit-index";
import { AutoScale, AUTO_TARGET_SPEED, SPEED_CAP, dotOffsets, phaseDelta, pointAlong, polylineLength } from "../src/dots";
import { AutoRange, chartWindow, niceCeil, niceTicks, roundOut } from "../src/axis";
import { RenderScheduler, type FrameClock } from "../src/scheduler";
import { CurrentAnimator, buildDotPaths, pathCurrent } from "../src/animator";
import { affineFrom, applyAffine } from "../src/canvas-graphics";
import { voltageColor, lightTheme } from "../src/theme";
import type { CompiledCircuit } from "@cs/model";

describe("ViewTransform", () => {
  test("16 px per grid unit at zoom 1", () => {
    const v = new ViewTransform();
    expect(v.toScreen({ x: 2, y: 3 })).toEqual({ x: 2 * PX_PER_GRID, y: 3 * PX_PER_GRID });
  });

  test("round-trips at arbitrary pan and zoom", () => {
    const v = new ViewTransform();
    v.setViewport(800, 600);
    v.panBy(37, -12);
    v.zoomAbout({ x: 100, y: 50 }, 2.7);
    for (const p of [{ x: 0, y: 0 }, { x: -13.5, y: 7.25 }, { x: 400, y: -9 }]) {
      const q = v.toGrid(v.toScreen(p));
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
  });

  test("zoomAbout keeps the anchor fixed and clamps 10–800%", () => {
    const v = new ViewTransform();
    v.setViewport(800, 600);
    const anchor = { x: 321, y: 123 };
    const before = v.toGrid(anchor);
    v.zoomAbout(anchor, 3);
    const after = v.toGrid(anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    v.zoomAbout(anchor, 1000);
    expect(v.zoom).toBe(MAX_ZOOM);
    v.zoomAbout(anchor, 1e-6);
    expect(v.zoom).toBe(MIN_ZOOM);
  });

  test("center survives viewport resize; snap rounds", () => {
    const v = new ViewTransform();
    v.setViewport(400, 300);
    v.center = { x: 10, y: 5 };
    v.setViewport(1000, 700);
    expect(v.center.x).toBeCloseTo(10);
    expect(v.center.y).toBeCloseTo(5);
    expect(v.snap(v.toScreen({ x: 3.4, y: -1.6 }))).toEqual({ x: 3, y: -2 });
  });
});

describe("HitIndex", () => {
  const idx = new HitIndex(4);
  idx.insert({ kind: "part", part: "R1", box: { x: 0, y: -1, w: 4, h: 2 } });
  idx.insert({ kind: "terminal", part: "R1", terminal: 0, at: { x: 0, y: 0 } });
  idx.insert({ kind: "terminal", part: "R1", terminal: 1, at: { x: 4, y: 0 } });
  idx.insert({ kind: "segment", wire: "w1", segment: 0, from: { x: 4, y: 0 }, to: { x: 20, y: 0 } });

  test("terminal beats part and segment at the same point", () => {
    const r = idx.query({ x: 4.1, y: 0.1 }, 0.4);
    expect(r[0].target).toMatchObject({ kind: "terminal", terminal: 1 });
    expect(r.map((h) => h.target.kind)).toContain("segment");
  });

  test("finds a long segment far from its ends (multi-cell insert)", () => {
    const r = idx.query({ x: 15, y: 0.2 }, 0.4);
    expect(r).toHaveLength(1);
    expect(r[0].target).toMatchObject({ kind: "segment", wire: "w1" });
  });

  test("inside a part box, misses empty space", () => {
    expect(idx.query({ x: 2, y: 0.5 }, 0.3)[0].target.kind).toBe("part");
    expect(idx.query({ x: 50, y: 50 }, 0.5)).toHaveLength(0);
  });

  test("coarse pointer tolerance is at least 22 px", () => {
    expect(hitTolerance(16, true) * 16).toBeGreaterThanOrEqual(22);
    expect(hitTolerance(16, false)).toBeLessThan(hitTolerance(16, true));
  });
});

describe("dot phase math", () => {
  test("phase advances by k·I·dt / spacing", () => {
    expect(phaseDelta(0.002, 1000, 0.5, 1)).toBeCloseTo(1);
    expect(phaseDelta(-0.002, 1000, 0.5, 2)).toBeCloseTo(-0.5);
  });

  test("trickle stands still and speed is capped", () => {
    expect(phaseDelta(1e-9, 1, 1)).toBe(0);
    expect(phaseDelta(1e6, 1, 1)).toBe(SPEED_CAP);
  });

  test("dot rate across a point is proportional to current (KCL by construction)", () => {
    // Two branches with 1 A and 2 A feed a 3 A wire: phase rates add.
    const k = 1;
    const dt = 0.25;
    const sum = phaseDelta(1, k, dt) + phaseDelta(2, k, dt);
    expect(phaseDelta(3, k, dt)).toBeCloseTo(sum);
  });

  test("dot offsets are evenly spaced and move forward with phase", () => {
    expect(dotOffsets(0.25, 3)).toEqual([0.25, 1.25, 2.25]);
    expect(dotOffsets(1.75, 2)).toEqual([0.75, 1.75]);
  });

  test("polyline helpers", () => {
    const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }];
    expect(polylineLength(pts)).toBe(7);
    expect(pointAlong(pts, 5)).toEqual({ x: 3, y: 2 });
  });

  test("auto scale puts the largest current at 4 grid/s and waits 1 s before rescaling", () => {
    const a = new AutoScale();
    a.update(0.001, 0);
    expect(a.k * 0.001).toBeCloseTo(AUTO_TARGET_SPEED);
    const k0 = a.k;
    a.update(0.05, 1); // 50x larger: starts the clock
    expect(a.k).toBe(k0);
    a.update(0.05, 1.5);
    expect(a.k).toBe(k0);
    a.update(0.05, 2.01);
    expect(a.k * 0.05).toBeCloseTo(AUTO_TARGET_SPEED);
  });
});

describe("CurrentAnimator", () => {
  const compiled = {
    netlist: {
      nodeCount: 1,
      nodeNames: ["GND", "N1"],
      elements: [
        { id: "R1", type: "resistor", nodes: [1, 0], props: {} },
        { id: "V1", type: "battery", nodes: [1, 0], props: {} },
      ],
      settings: { realisticParts: false, realisticRatings: false, start: "zero", seed: 1 },
    },
    nodes: [],
    pointToNode: new Map(),
    segments: [{ wire: "w1", segment: 0, from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, node: 1, terms: [{ element: "V1", terminal: 0, sign: -1 }] }],
    channels: {},
    identity: {},
    diagnostics: [],
  } as unknown as CompiledCircuit;

  test("maps segment terms and part paths onto the display terminal block", () => {
    const paths = buildDotPaths(compiled, {
      parts: { R1: { id: "R1", type: "resistor", label: "R1", at: { x: 0, y: 0 }, orientation: { rot: 0, flip: false }, props: {} } },
      getView: () => ({
        drawSymbol() {},
        currentPaths: () => [{ points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], from: 0, to: 1 }],
        hitShape: () => ({ x: 0, y: 0, w: 4, h: 1 }),
        describe: () => ({ key: "r" }),
      }),
      localToDocument: (_p, q) => ({ x: q.x + 10, y: q.y }),
    });
    // display: [V0, V1, R1.t0, R1.t1, V1.t0, V1.t1]
    const display = new Float64Array([0, 5, 0.002, -0.002, -0.002, 0.002]);
    const wire = paths.find((p) => p.key === "w:w1:0")!;
    const part = paths.find((p) => p.key === "p:R1:0")!;
    expect(pathCurrent(wire, display)).toBeCloseTo(0.002);
    expect(pathCurrent(part, display)).toBeCloseTo(0.002);
    expect(part.points[0]).toEqual({ x: 10, y: 0 });
  });

  test("advances only with real time while running; paused uses simulated time / speed", () => {
    const a = new CurrentAnimator();
    a.setPaths([{ key: "s", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], terms: [{ index: 0, sign: 1 }] }]);
    a.fixedK = 1;
    a.setDisplay(new Float64Array([2]));
    a.running = false;
    expect(a.tick(0.5, 0)).toBe(false);
    a.running = true;
    expect(a.tick(0.5, 0.5)).toBe(true); // phase += 1
    a.advanceSimulated(0.001, 0.001); // 1 real second at speed 1e-3 -> += 2
    const offsets: number[] = [];
    // Phase is 3.0: dots sit on whole grid units.
    const ctx = { beginPath() {}, arc(x: number) { offsets.push(x); }, fill() {}, set fillStyle(_: string) {}, set strokeStyle(_: string) {} };
    const v = new ViewTransform();
    a.draw(ctx as unknown as CanvasRenderingContext2D, v, lightTheme);
    expect(offsets.map((x) => x / 16)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("axis", () => {
  test("niceCeil picks 1-2-5", () => {
    expect(niceCeil(0.7)).toBe(1);
    expect(niceCeil(1.3)).toBe(2);
    expect(niceCeil(3)).toBe(5);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(0.0042)).toBeCloseTo(0.005);
  });

  test("niceTicks covers the range with clean values", () => {
    expect(niceTicks(0, 10, 5)).toEqual({ step: 2, ticks: [0, 2, 4, 6, 8, 10] });
    expect(niceTicks(0, 1, 5).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(-3.3, 3.3, 6).ticks).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  test("roundOut ends on 1-2-5 values", () => {
    expect(roundOut(0, 9.9)).toEqual({ min: 0, max: 20 });
    expect(roundOut(-0.3, 4)).toEqual({ min: -0.5, max: 5 });
  });

  test("auto range expands at once, shrinks after 2 s at < 1/4 use", () => {
    const r = new AutoRange();
    expect(r.update(0, 4, 0)).toEqual({ min: 0, max: 5 });
    expect(r.update(0, 9, 0.1)).toEqual({ min: 0, max: 10 });
    expect(r.update(0, 1, 0.2).max).toBe(10);
    expect(r.update(0, 1, 1.5).max).toBe(10);
    expect(r.update(0, 1, 2.3).max).toBe(2);
  });

  test("chart window roll and sweep", () => {
    expect(chartWindow("roll", 2, 5)).toEqual({ t0: 0, t1: 5 });
    expect(chartWindow("roll", 12, 5)).toEqual({ t0: 7, t1: 12 });
    expect(chartWindow("sweep", 12, 5)).toEqual({ t0: 10, t1: 15 });
  });
});

describe("RenderScheduler", () => {
  function fakeClock() {
    const q: Array<(t: number) => void> = [];
    const clock: FrameClock = { request: (cb) => q.push(cb), cancel: () => {} };
    return { clock, q, step: (t: number) => q.shift()?.(t) };
  }

  test("draws only invalidated layers and sleeps when idle", () => {
    const { clock, q, step } = fakeClock();
    const s = new RenderScheduler(clock);
    const drawn: string[] = [];
    s.onDraw("grid", () => drawn.push("grid"));
    s.onDraw("overlay", () => drawn.push("overlay"));
    expect(q).toHaveLength(1);
    step(0);
    expect(drawn).toEqual(["grid", "overlay"]);
    expect(q).toHaveLength(0); // asleep
    s.invalidate("overlay");
    s.invalidate("overlay");
    expect(q).toHaveLength(1);
    step(16);
    expect(drawn).toEqual(["grid", "overlay", "overlay"]);
  });

  test("tickers keep it running and receive real dt", () => {
    const { clock, q, step } = fakeClock();
    const s = new RenderScheduler(clock);
    const dts: number[] = [];
    let frames = 3;
    s.addTicker((dt) => (dts.push(dt), --frames > 0));
    step(1000);
    step(1016);
    step(1032);
    expect(q).toHaveLength(0);
    expect(dts[0]).toBe(0);
    expect(dts[1]).toBeCloseTo(0.016);
  });

  test("hidden stops the loop", () => {
    const { clock, q } = fakeClock();
    const s = new RenderScheduler(clock);
    s.setVisible(false);
    q.length = 0;
    s.invalidate("grid");
    expect(q).toHaveLength(0);
  });
});

describe("graphics helpers", () => {
  test("affineFrom reproduces a rotate+translate map", () => {
    const map = (p: { x: number; y: number }) => ({ x: -p.y * 16 + 100, y: p.x * 16 + 50 });
    const m = affineFrom(map);
    expect(applyAffine(m, { x: 2, y: 3 })).toEqual(map({ x: 2, y: 3 }));
  });

  test("voltage color is gray at 0 and saturates at the range", () => {
    expect(voltageColor(lightTheme, 0, 10)).toBe("rgb(128,134,142)");
    expect(voltageColor(lightTheme, 50, 10)).toBe("rgb(46,158,68)");
    expect(voltageColor(lightTheme, -10, 10)).toBe("rgb(211,47,47)");
  });
});
