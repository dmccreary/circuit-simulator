import type { Stamper, StepInfo } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import type { PropValue } from "@cs/model";
import { Circuit, currentsOf, dcStep, readoutsOf, tran, view } from "./harness";

/** Records every Stamper call. */
class RecordingStamper implements Stamper {
  calls: [string, ...number[]][] = [];
  matrix(r: number, c: number, v: number) { this.calls.push(["matrix", r, c, v]); }
  rhs(r: number, v: number) { this.calls.push(["rhs", r, v]); }
  conductance(a: number, b: number, g: number) { this.calls.push(["conductance", a, b, g]); }
  current(a: number, b: number, i: number) { this.calls.push(["current", a, b, i]); }
  voltageSource(br: number, p: number, m: number, v: number) { this.calls.push(["voltageSource", br, p, m, v]); }
}

function model(type: string, nodes: number[], props: Record<string, PropValue> = {}, branches = 10) {
  const m = getModelFactory(type)!({ id: "x", type, nodes, props });
  let next = branches;
  m.setup({ nodes, allocBranch: () => next++ });
  return m;
}

const close = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe("resistor", () => {
  it("stamps its conductance", () => {
    const s = new RecordingStamper();
    model("resistor", [1, 2], { resistance: 2000 }).stampStatic!(s);
    expect(s.calls).toEqual([["conductance", 1, 2, 0.0005]]);
  });

  it("solves a battery and resistor with consistent signs", () => {
    const c = new Circuit(1, [
      { type: "battery", nodes: [1, 0], props: { voltage: 9 } },
      { type: "resistor", nodes: [1, 0], props: { resistance: 1000 } },
    ]);
    const x = c.step(dcStep);
    close(x[1], 9);
    close(readoutsOf(c.models[0], x).voltage, 9);
    close(readoutsOf(c.models[0], x).current, 0.009);
    close(readoutsOf(c.models[0], x).power, 0.081);
    close(readoutsOf(c.models[1], x).power, 0.081);
    // Current flows out of the battery's "+" and into the resistor's first terminal.
    expect(currentsOf(c.models[0], x, 2).map((v) => +v.toFixed(9))).toEqual([-0.009, 0.009]);
    expect(currentsOf(c.models[1], x, 2).map((v) => +v.toFixed(9))).toEqual([0.009, -0.009]);
  });

  it("honours internal resistance and source stepping", () => {
    const c = new Circuit(1, [
      { type: "battery", nodes: [1, 0], props: { voltage: 9, internalResistance: 1 } },
      { type: "resistor", nodes: [1, 0], props: { resistance: 8 } },
    ]);
    close(c.solve(dcStep)[1], 8);
    close(c.solve({ ...dcStep, sourceScale: 0.5 })[1], 4);
  });
});

describe("capacitor companion", () => {
  const step = (method: "be" | "trap"): StepInfo => tran(1e-3, 1e-3, method);

  it("BE: geq = C/dt, ieq = -geq·v[n-1]", () => {
    const s = new RecordingStamper();
    model("capacitor", [1, 2], { capacitance: 1e-6, initialVoltage: 2 }).stampStep!(s, step("be"));
    expect(s.calls[0]).toEqual(["conductance", 1, 2, 1e-3]);
    expect(s.calls[1][0]).toBe("current");
    close(s.calls[1][3], -2e-3);
  });

  it("trap: geq = 2C/dt, ieq = -geq·v[n-1] - i[n-1]", () => {
    const m = model("capacitor", [1, 2], { capacitance: 1e-6 });
    m.loadState(Float64Array.from([2, 0.5, 0]));
    const s = new RecordingStamper();
    m.stampStep!(s, step("trap"));
    expect(s.calls[0]).toEqual(["conductance", 1, 2, 2e-3]);
    close(s.calls[1][3], -4e-3 - 0.5);
  });

  it("is open for DC and restores savedState", () => {
    const s = new RecordingStamper();
    const m = getModelFactory("capacitor")!({ id: "c", type: "capacitor", nodes: [1, 0], props: {}, savedState: [3, 0, 0] });
    m.setup({ nodes: [1, 0], allocBranch: () => 5 });
    m.stampStep!(s, dcStep);
    expect(s.calls).toEqual([]);
    const out = new Float64Array(m.stateSize);
    m.saveState(out);
    expect(out[0]).toBe(3);
  });

  it.each([
    ["trap", 1e-4],
    ["be", 5e-3],
  ] as const)("charges an RC circuit (%s)", (method, tol) => {
    const c = new Circuit(2, [
      { type: "battery", nodes: [1, 0], props: { voltage: 1 } },
      { type: "resistor", nodes: [1, 2], props: { resistance: 1000 } },
      { type: "capacitor", nodes: [2, 0], props: { capacitance: 1e-6 } },
    ]);
    const dt = 1e-5;
    let x: number[] = [];
    for (let k = 1; k <= 200; k++) x = c.step(tran(k * dt, dt, k === 1 ? "be" : method));
    expect(Math.abs(x[2] - (1 - Math.exp(-2)))).toBeLessThan(tol);
    const r = readoutsOf(c.models[2], x);
    close(r.charge, 1e-6 * x[2]);
    expect(Math.abs(r.current - (1 - x[2]) / 1000)).toBeLessThan(1e-6);
    expect(c.models[2].truncationError!(view(x), tran(2e-3, dt, method))).toBeLessThan(1e-4);
  });
});

describe("inductor", () => {
  it("is a short in DC", () => {
    const c = new Circuit(2, [
      { type: "battery", nodes: [1, 0], props: { voltage: 1 } },
      { type: "resistor", nodes: [1, 2], props: { resistance: 10 } },
      { type: "inductor", nodes: [2, 0], props: { inductance: 1 } },
    ]);
    const x = c.step(dcStep);
    close(x[2], 0);
    close(readoutsOf(c.models[2], x).current, 0.1);
  });

  it("rises in an RL circuit (trap)", () => {
    const c = new Circuit(2, [
      { type: "battery", nodes: [1, 0], props: { voltage: 1 } },
      { type: "resistor", nodes: [1, 2], props: { resistance: 1 } },
      { type: "inductor", nodes: [2, 0], props: { inductance: 1e-3 } },
    ]);
    const dt = 1e-5;
    let x: number[] = [];
    for (let k = 1; k <= 100; k++) x = c.step(tran(k * dt, dt, k === 1 ? "be" : "trap"));
    expect(Math.abs(currentsOf(c.models[2], x, 2)[0] - (1 - Math.exp(-1)))).toBeLessThan(1e-3);
  });

  it("keeps an ideal LC tank ringing with trapezoidal integration (SIM-22)", () => {
    const L = 1e-3;
    const C = 1e-6;
    const c = new Circuit(1, [
      { type: "capacitor", nodes: [1, 0], props: { capacitance: C, initialVoltage: 1 } },
      { type: "inductor", nodes: [1, 0], props: { inductance: L } },
    ]);
    const period = 2 * Math.PI * Math.sqrt(L * C);
    const dt = period / 50;
    let peak = 0;
    for (let k = 1; k <= 50 * 100; k++) {
      const x = c.step(tran(k * dt, dt, "trap"));
      if (k > 50 * 99) peak = Math.max(peak, Math.abs(x[1]));
    }
    expect(peak).toBeGreaterThan(0.99);
    expect(peak).toBeLessThan(1.01);
  });
});

describe("sources", () => {
  it("ac source follows offset + A·sin(ωt + φ)", () => {
    const m = model("ac-source", [1, 0], { amplitude: 2, frequency: 50, offset: 1, phase: 90 });
    const s = new RecordingStamper();
    m.stampStep!(s, tran(0.002, 1e-4));
    const v = s.calls.find((c) => c[0] === "voltageSource")![4];
    close(v, 1 + 2 * Math.sin(2 * Math.PI * 50 * 0.002 + Math.PI / 2), 1e-12);
  });

  it("square source switches levels and reports its edges as breakpoints", () => {
    const m = model("square-source", [1, 0], { amplitude: 1, frequency: 1000, dutyCycle: 25 });
    const v = (t: number) => {
      const s = new RecordingStamper();
      m.stampStep!(s, tran(t, 1e-6));
      return s.calls[0][4];
    };
    expect(v(0.0001)).toBe(1);
    expect(v(0.0004)).toBe(-1);
    expect(v(0.00025)).toBe(-1); // landing exactly on the falling edge sees the new level
    expect(v(0.001)).toBe(1);
    const out: number[] = [];
    m.breakpoints!(0, 0.002, out);
    expect(out.map((t) => +t.toPrecision(9))).toEqual([0.00025, 0.001, 0.00125, 0.002]);
  });

  it("current source pushes current out of its second terminal", () => {
    const c = new Circuit(1, [
      { type: "current-source", nodes: [0, 1], props: { current: 0.01 } },
      { type: "resistor", nodes: [1, 0], props: { resistance: 1000 } },
    ]);
    const x = c.step(dcStep);
    close(x[1], 10);
    expect(currentsOf(c.models[0], x, 2)).toEqual([0.01, -0.01]);
    close(readoutsOf(c.models[0], x).power, 0.1);
  });
});

describe("switches and meters", () => {
  const circuit = (type: string, props: Record<string, PropValue>) =>
    new Circuit(2, [
      { type: "battery", nodes: [1, 0], props: { voltage: 10 } },
      { type, nodes: [1, 2], props },
      { type: "resistor", nodes: [2, 0], props: { resistance: 100 } },
    ]);

  it.each([
    ["switch", { closed: false }, 0],
    ["switch", { closed: true }, 0.1],
    ["push-button", { pressed: false }, 0],
    ["push-button", { pressed: true }, 0.1],
    ["push-button", { pressed: false, normallyClosed: true }, 0.1],
    ["ammeter", {}, 0.1],
  ] as const)("%s %j passes %d A", (type, props, amps) => {
    const c = circuit(type, props);
    const x = c.step(dcStep);
    expect(Math.abs(readoutsOf(c.models[1], x).current - amps)).toBeLessThan(1e-6);
  });

  it("switch reacts to setProps", () => {
    const c = circuit("switch", { closed: false });
    c.models[1].setProps({ closed: true });
    expect(readoutsOf(c.models[1], c.step(dcStep)).closed).toBe(1);
  });

  it("voltmeter reads without loading the circuit", () => {
    const c = new Circuit(1, [
      { type: "battery", nodes: [1, 0], props: { voltage: 3 } },
      { type: "resistor", nodes: [1, 0], props: { resistance: 100 } },
      { type: "voltmeter", nodes: [1, 0] },
    ]);
    const x = c.step(dcStep);
    expect(readoutsOf(c.models[2], x)).toMatchObject({ voltage: 3, current: 0 });
  });

  it("lamp is ohmic at V²/P and reports brightness", () => {
    const c = new Circuit(1, [
      { type: "battery", nodes: [1, 0], props: { voltage: 6 } },
      { type: "lamp", nodes: [1, 0], props: { ratedVoltage: 6, ratedPower: 3 } },
    ]);
    const r = readoutsOf(c.models[1], c.step(dcStep));
    close(r.resistance, 12);
    close(r.power, 3);
    close(r.brightness, 1);
  });

  it("potentiometer divides at its wiper", () => {
    const c = new Circuit(2, [
      { type: "battery", nodes: [1, 0], props: { voltage: 10 } },
      { type: "potentiometer", nodes: [1, 0, 2], props: { resistance: 1000, position: 0.3 } },
    ]);
    const x = c.step(dcStep);
    close(x[2], 7);
    const i = currentsOf(c.models[1], x, 3);
    close(i[0] + i[1] + i[2], 0);
    close(i[0], 0.01);
    close(readoutsOf(c.models[1], x).resistanceA, 300);
  });
});

describe("diode", () => {
  const IS = 1e-14;
  const NVT = 0.025852;
  const shockley = (v: number) => IS * (Math.exp(v / NVT) - 1);

  it.each([-1, 0, 0.3, 0.6, 0.7])("Newton stamp at %d V matches Shockley", (v) => {
    const m = model("diode", [1, 2]);
    m.loadState(Float64Array.from([v])); // start Newton at v so limiting leaves it alone
    const s = new RecordingStamper();
    const x = [0, v, 0];
    m.stampNewton!(s, view(x), { ...dcStep, gmin: 0 });
    const g = s.calls[0][3];
    const ieq = s.calls[1][3];
    close(g, (IS / NVT) * Math.exp(v / NVT), 1e-9);
    close(g * v + ieq, shockley(v), 1e-9);
  });

  it("limits a wild first guess", () => {
    const m = model("diode", [1, 0]);
    const s = new RecordingStamper();
    m.stampNewton!(s, view([0, 50]), dcStep);
    expect(Number.isFinite(s.calls[0][3])).toBe(true);
    expect(s.calls[0][3]).toBeLessThan(1e3);
  });

  it.each([5, 100])("converges in a series circuit at %d V", (vs) => {
    const c = new Circuit(2, [
      { type: "battery", nodes: [1, 0], props: { voltage: vs } },
      { type: "resistor", nodes: [1, 2], props: { resistance: 1000 } },
      { type: "diode", nodes: [2, 0] },
    ]);
    const x = c.step(dcStep);
    const iR = (vs - x[2]) / 1000;
    expect(Math.abs(shockley(x[2]) - iR) / iR).toBeLessThan(1e-3);
    expect(readoutsOf(c.models[2], x).forward).toBe(1);
  });

  it("blocks in reverse", () => {
    const c = new Circuit(2, [
      { type: "battery", nodes: [1, 0], props: { voltage: -5 } },
      { type: "resistor", nodes: [1, 2], props: { resistance: 1000 } },
      { type: "diode", nodes: [2, 0] },
    ]);
    const x = c.step(dcStep);
    expect(Math.abs(readoutsOf(c.models[2], x).current)).toBeLessThan(1e-9);
  });

  it.each([
    ["red", 1.8],
    ["blue", 2.8],
  ])("%s LED drops its forward voltage at full-brightness current", (color, vf) => {
    const c = new Circuit(1, [
      { type: "current-source", nodes: [0, 1], props: { current: 0.02 } },
      { type: "led", nodes: [1, 0], props: { color } },
    ]);
    const x = c.step(dcStep);
    expect(Math.abs(x[1] - vf)).toBeLessThan(1e-3);
    expect(Math.abs(readoutsOf(c.models[1], x).brightness - 1)).toBeLessThan(1e-3);
  });
});
