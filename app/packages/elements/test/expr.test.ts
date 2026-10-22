// The formula language of expression sources, ported from CircuitJS1's ExprParser.
import { compileExpr, ExprError, newExprState } from "../src/expression-source/expr";

function ev(src: string, values: number[] = [], extra: Partial<ReturnType<typeof newExprState>> = {}): number {
  const s = { ...newExprState(), ...extra };
  values.forEach((v, i) => (s.values[i] = v));
  return compileExpr(src)(s);
}

describe("expressions", () => {
  test.each([
    ["1+2*3", 7],
    ["(1+2)*3", 9],
    ["2^3^2", 64], // left-associative, as in CircuitJS1
    ["-2^2", -4],
    ["1 < 2 && 3 >= 3", 1],
    ["0 ? 5 : 6", 6],
    ["!0 + !3", 1],
    ["clamp(5, -1, 2)", 2],
    ["min(3, 1, 2) + max(1, 4)", 5],
    ["pwl(0.05, 0, 0, 0.1, 5)", 2.5],
    ["pwl(1, 0, 0, 0.1, 5)", 5],
    ["step(-1) + step(1) + step(3, 2)", 1],
    ["select(1, 7, 8)", 8],
    ["pwrs(-2, 2)", -4],
    ["mod(7, 3)", 1],
    ["abs(-3) + sqrt(16) + floor(2.7) + ceil(2.1)", 12],
    ["2.5e-3*1e3", 2.5],
    ["pi", Math.PI],
    ["6 >> 1 | 1", 3],
  ])("%s = %d", (src, want) => {
    expect(ev(src)).toBeCloseTo(want, 12);
  });

  test("variables, history, and derivatives", () => {
    expect(ev("a*b + c", [2, 3, 4])).toBe(10);
    expect(ev("e")).toBeCloseTo(Math.E, 12);
    const last = new Float64Array(9);
    last[0] = 1;
    expect(ev("dadt", [3], { lastValues: last, timestep: 0.5 })).toBe(4);
    expect(ev("lasta + lastoutput + timestep + t", [], { lastValues: last, lastOutput: 2, timestep: 0.25, t: 10 })).toBe(13.25);
    expect(ev("dadt", [3], { lastValues: last, timestep: 0 })).toBe(0);
  });

  test.each(["(1+2", "foo(1)", "1 2", "clamp(1, 2)"])("rejects %s", (src) => {
    expect(() => compileExpr(src)).toThrow(ExprError);
  });
});
