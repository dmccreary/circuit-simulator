import { cos, createRng, exp, expm1, log, pow, sin, tanh } from "@cs/dmath";

function relErr(a: number, b: number): number {
  if (a === b) return 0;
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
}

function sweep(lo: number, hi: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(lo + ((hi - lo) * i) / n + 1e-7 * (i % 7));
  return out;
}

const TOL = 1e-14;

describe("dmath", () => {
  test("exp", () => {
    for (const x of sweep(-700, 700, 4001)) expect(relErr(exp(x), Math.exp(x))).toBeLessThan(TOL);
    for (const x of sweep(-1, 1, 2001)) expect(relErr(exp(x), Math.exp(x))).toBeLessThan(TOL);
    expect(exp(0)).toBe(1);
    expect(exp(800)).toBe(Infinity);
    expect(exp(-800)).toBe(0);
    expect(relErr(exp(-740), Math.exp(-740))).toBeLessThan(1e-3); // subnormal
    expect(exp(NaN)).toBeNaN();
  });

  test("expm1 keeps relative accuracy near zero", () => {
    for (const x of [1e-12, -3e-9, 1e-5, 0.3, -0.49, 2, -5]) expect(relErr(expm1(x), Math.expm1(x))).toBeLessThan(TOL);
  });

  test("log", () => {
    for (const x of sweep(1e-6, 1e6, 4001)) expect(relErr(log(x), Math.log(x))).toBeLessThan(TOL);
    for (const x of sweep(0.5, 2, 2001)) {
      const ref = Math.log(x);
      expect(Math.abs(log(x) - ref)).toBeLessThanOrEqual(TOL * Math.max(Math.abs(ref), 1e-300) + 1e-17);
    }
    for (const x of [1e-300, 5e-324, 1e300, 1 + 1e-12, 1 - 1e-12]) expect(relErr(log(x), Math.log(x))).toBeLessThan(TOL);
    expect(log(1)).toBe(0);
    expect(log(0)).toBe(-Infinity);
    expect(log(-1)).toBeNaN();
  });

  test("sin and cos", () => {
    for (const x of sweep(-1000, 1000, 8001)) {
      // Absolute error relative to 1: relative error is meaningless at zeros.
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(TOL);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(TOL);
    }
    for (const x of sweep(-0.7, 0.7, 1001)) {
      expect(relErr(sin(x), Math.sin(x))).toBeLessThan(TOL);
      expect(relErr(cos(x), Math.cos(x))).toBeLessThan(TOL);
    }
    expect(sin(Infinity)).toBeNaN();
  });

  test("pow", () => {
    for (const x of sweep(0.01, 50, 501))
      for (const y of [-3.7, -2, -0.5, 0.25, 1.2, 2, 3, 5.5, 7]) expect(relErr(pow(x, y), Math.pow(x, y))).toBeLessThan(TOL);
    expect(pow(-2, 3)).toBe(-8);
    expect(pow(-2, 0.5)).toBeNaN();
    expect(pow(0, 2)).toBe(0);
    expect(pow(5, 0)).toBe(1);
  });

  test("tanh", () => {
    for (const x of sweep(-25, 25, 5001)) expect(relErr(tanh(x), Math.tanh(x))).toBeLessThan(TOL);
    for (const x of [1e-10, -1e-6, 0.01, 0.2]) expect(relErr(tanh(x), Math.tanh(x))).toBeLessThan(TOL);
  });

  test("rng is reproducible, uniform, and gaussian", () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const xs: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      xs.push(v);
    }
    expect(c.next()).not.toBe(createRng(42).next());
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.01);

    const g = createRng(7);
    let s1 = 0;
    let s2 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = g.nextGaussian();
      s1 += v;
      s2 += v * v;
    }
    expect(Math.abs(s1 / n)).toBeLessThan(0.03);
    expect(Math.abs(s2 / n - 1)).toBeLessThan(0.05);
  });
});
