import { describe, expect, it } from "vitest";
import { crossings, dutyCycle, fallTime, frequency, max, mean, min, peakToPeak, period, riseTime, rms, type MeasureResult } from "@cs/history";

const val = (r: MeasureResult): number => {
  if (!r.ok) throw new Error(r.reason.key);
  return r.value;
};

// 5 Hz sine, amplitude 2, offset 1, over exactly 4 periods with a variable step.
function sine() {
  const t: number[] = [];
  const v: number[] = [];
  let x = 0;
  let k = 0;
  while (x <= 0.8 + 1e-12) {
    t.push(x);
    v.push(1 + 2 * Math.sin(2 * Math.PI * 5 * x));
    x += k++ % 2 ? 1e-4 : 3e-4; // alternating steps
  }
  return { t, v };
}

// 100 Hz square wave, 0..5 V, duty 30%, 10 us linear edges.
function square() {
  const t: number[] = [];
  const v: number[] = [];
  const T = 0.01;
  const edge = 1e-5;
  for (let x = 0; x <= 0.05; x += 1e-6) {
    const ph = x % T;
    let y: number;
    if (ph < edge) y = (5 * ph) / edge;
    else if (ph < 0.3 * T) y = 5;
    else if (ph < 0.3 * T + edge) y = 5 - (5 * (ph - 0.3 * T)) / edge;
    else y = 0;
    t.push(x);
    v.push(y);
  }
  return { t, v };
}

describe("measurements on a sine", () => {
  const { t, v } = sine();
  it("mean, rms, min, max, peak-to-peak", () => {
    expect(val(mean(t, v))).toBeCloseTo(1, 4);
    expect(val(rms(t, v))).toBeCloseTo(Math.sqrt(1 + 2), 4);
    expect(val(min(t, v))).toBeCloseTo(-1, 3);
    expect(val(max(t, v))).toBeCloseTo(3, 3);
    expect(val(peakToPeak(t, v))).toBeCloseTo(4, 3);
  });
  it("frequency and period", () => {
    expect(val(period(t, v))).toBeCloseTo(0.2, 5);
    expect(val(frequency(t, v))).toBeCloseTo(5, 3);
    expect(crossings(t, v).rising.length).toBe(3); // t = 0 starts on the level, so it is not a crossing
    const p = period(t, v);
    expect(p.ok && p.provenance.values?.periods).toBe(2);
  });
  it("needs two rising crossings", () => {
    const r = period(t.slice(0, 300), v.slice(0, 300));
    expect(r).toEqual({ ok: false, reason: { key: "measure.needTwoPeriods", values: undefined } });
  });
});

describe("measurements on a square wave", () => {
  const { t, v } = square();
  it("frequency, duty cycle", () => {
    expect(val(frequency(t, v))).toBeCloseTo(100, 3);
    expect(val(dutyCycle(t, v))).toBeCloseTo(0.3, 3);
  });
  it("rise and fall time (10%-90%)", () => {
    expect(val(riseTime(t, v))).toBeCloseTo(8e-6, 8);
    expect(val(fallTime(t, v))).toBeCloseTo(8e-6, 8);
  });
  it("ignores noise inside the hysteresis band", () => {
    const noisy = v.map((y, i) => y + (i % 2 ? 0.05 : -0.05));
    expect(val(frequency(t, noisy))).toBeCloseTo(100, 2);
  });
  it("skips NaN gaps", () => {
    const withGap = v.map((y, i) => (i < 10 ? NaN : y));
    expect(val(max(t, withGap))).toBe(5);
  });
});
