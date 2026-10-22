import { engine } from "../../../tests/helpers/circuit";
import type { Engine, EngineEvent } from "@cs/engine";
import { heatStep, perceptualBrightness, stressRatio, timeToFail } from "../src/shared/thermal";
import { RATINGS, failThreshold, measure, ratingStress } from "../src/shared/ratings";

function runCollecting(e: Engine, until: number): EngineEvent[] {
  const events: EngineEvent[] = [];
  while (e.time < until) {
    const out = e.step();
    if (!out.ok) throw new Error(`step failed at ${e.time}: ${JSON.stringify(e.diagnostics)}`);
    events.push(...e.drainEvents());
  }
  return events;
}

const failures = (ev: EngineEvent[]) => ev.filter((x) => x.kind === "partFailed");

describe("thermal model", () => {
  it("heats toward the stress ratio with its time constant", () => {
    expect(heatStep(0, 2, 1, 1)).toBeCloseTo(2 * (1 - Math.exp(-1)), 12);
    // Splitting a step gives the same answer (exact exponential update).
    expect(heatStep(heatStep(0, 2, 0.5, 1), 2, 0.5, 1)).toBeCloseTo(heatStep(0, 2, 1, 1), 12);
    expect(heatStep(0.7, 2, 0, 1)).toBe(0.7);
  });

  it("never fails at or below the absolute limit, and fails fast far above it", () => {
    expect(timeToFail(2, 2, 1)).toBe(Infinity);
    expect(timeToFail(100, 2, 2)).toBeLessThan(0.05);
    expect(stressRatio(0.04, 0.02, 2)).toBeCloseTo(4);
  });

  it("maps light to a perceptual brightness scale", () => {
    expect(perceptualBrightness(0)).toBe(0);
    expect(perceptualBrightness(1)).toBe(1);
    expect(perceptualBrightness(0.125)).toBeCloseTo(0.5);
    expect(perceptualBrightness(5)).toBe(1);
  });

  it("measures the rated quantity from terminal voltages and currents", () => {
    const [res] = RATINGS.resistor;
    expect(measure(res, [12, 0], [0.12, -0.12])).toBeCloseTo(1.44);
    const [led] = RATINGS.led;
    expect(ratingStress(led, {}, [2, 0], [0.04, -0.04])).toBeCloseTo(4);
    expect(ratingStress(led, { currentRating: 0.04 }, [2, 0], [0.04, -0.04])).toBeCloseTo(1);
    expect(failThreshold(led)).toBeCloseTo(2.25);
    const reverse = RATINGS.diode[1];
    expect(measure(reverse, [0, 50], [0, 0])).toBe(50);
    expect(measure(reverse, [50, 0], [0, 0])).toBe(0);
  });
});

describe("ratings and failure in the engine (RLM-05/06)", () => {
  const circuit = (r: number, ratings = true, extra: Record<string, number | string> = {}) =>
    engine(
      1,
      [
        ["B1", "battery", [1, 0], { voltage: 12 }],
        ["R1", "resistor", [1, 0], { resistance: r, ...extra }],
      ],
      { realisticRatings: ratings },
    );

  it("a 1/4 W resistor across 12 V (1.44 W) fails open after about 0.85 s", () => {
    const e = circuit(100);
    const ev = failures(runCollecting(e, 2));
    expect(ev).toHaveLength(1);
    expect(ev[0].element).toBe("R1");
    expect(ev[0].detail).toBe("open");
    // Analytic: -τ ln(1 - θfail/s) with τ = 2 s, θfail = 2, s = 5.76.
    expect(ev[0].t).toBeCloseTo(timeToFail(5.76, 2, 2), 1);
    expect(Math.abs(e.readouts("R1").current)).toBeLessThan(1e-9);
    expect(e.readouts("R1").failed).toBe(1);
  });

  it("a part within its rating, or with ratings off, never fails", () => {
    expect(failures(runCollecting(circuit(1000), 5))).toHaveLength(0); // 0.144 W
    expect(failures(runCollecting(circuit(100, false), 2))).toHaveLength(0);
  });

  it("an edited rating is honoured", () => {
    expect(failures(runCollecting(circuit(100, true, { powerRating: 2 }), 3))).toHaveLength(0);
  });

  it("the failed prop keeps a part failed, and clearing it repairs it", () => {
    const e = circuit(100, true, { failed: "open" });
    runCollecting(e, 0.01);
    expect(Math.abs(e.readouts("R1").current)).toBeLessThan(1e-9);
    e.setParams([{ element: "R1", param: "failed", value: "" }]);
    runCollecting(e, 0.02);
    expect(e.readouts("R1").current).toBeCloseTo(0.12, 6);
    expect(e.readouts("R1").heat).toBeLessThan(0.1);
  });

  it("other value edits do not repair a failed part", () => {
    const e = circuit(100);
    runCollecting(e, 1.5);
    e.setParams([{ element: "R1", param: "resistance", value: 120 }]);
    runCollecting(e, 1.6);
    expect(Math.abs(e.readouts("R1").current)).toBeLessThan(1e-9);
  });

  it("an LED straight across a 9 V battery burns out almost at once", () => {
    const e = engine(
      1,
      [
        // A real battery's internal resistance (an ideal source across a diode has no solution).
        ["B1", "battery", [1, 0], { voltage: 9, internalResistance: 0.5 }],
        ["D1", "led", [1, 0], { color: "red" }],
      ],
      { realisticRatings: true },
    );
    const ev = failures(runCollecting(e, 0.5));
    expect(ev).toHaveLength(1);
    expect(ev[0].t).toBeLessThan(0.1);
  });

  it("an LED at 25 mA heats but survives; at 87 mA it fails in well under a second", () => {
    // 9 V, red LED (~1.8 V): R sets the current.
    const led = (r: number) =>
      engine(
        2,
        [
          ["B1", "battery", [1, 0], { voltage: 9 }],
          ["R1", "resistor", [1, 2], { resistance: r, powerRating: 10 }],
          ["D1", "led", [2, 0], { color: "red" }],
        ],
        { realisticRatings: true },
      );
    expect(failures(runCollecting(led(290), 10))).toHaveLength(0);
    const ev = failures(runCollecting(led(83), 2));
    expect(ev).toHaveLength(1);
    expect(ev[0].t).toBeGreaterThan(0.2);
    expect(ev[0].t).toBeLessThan(0.8);
  });
});
