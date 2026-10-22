// Agent "analog2" parts: tunnel diode, varactor, polarized capacitor, spark gap,
// crystal, SCR, triac, diac, triode, unijunction transistor, antenna.
import { Circuit, dcStep, readoutsOf, tran } from "./harness";
import { tunnelCurve } from "../src/tunnel-diode/model";
import { antennaVoltage } from "../src/antenna/model";
import { triodeCurrents } from "../src/triode/model";

const rail = (node: number, voltage: number) => ({ type: "rail", nodes: [node], props: { waveform: "dc", voltage } });
const res = (a: number, b: number, resistance: number) => ({ type: "resistor", nodes: [a, b], props: { resistance } });

/** Run transient steps of dt until t; return the last solution. */
function run(c: Circuit, t: number, dt: number): number[] {
  let x = c.x;
  for (let k = 1; k * dt <= t + 1e-15; k++) x = c.step(tran(k * dt, dt, "be"));
  return x;
}

describe("tunnel diode", () => {
  test("peak, negative resistance, valley", () => {
    expect(tunnelCurve(0.1).i).toBeCloseTo(4.7e-3, 4);
    expect(tunnelCurve(0.25).g).toBeLessThan(0);
    expect(tunnelCurve(0.37).i).toBeLessThan(tunnelCurve(0.1).i / 2);
    expect(Number.isFinite(tunnelCurve(50).i)).toBe(true);
  });

  test("solves on a 0.1 V rail", () => {
    const c = new Circuit(1, [rail(1, 0.1), { type: "tunnel-diode", nodes: [1, 0] }]);
    const x = c.step(dcStep);
    expect(readoutsOf(c.models[1], x).current).toBeCloseTo(4.7e-3, 4);
  });
});

describe("varactor", () => {
  test("capacitance falls with reverse bias", () => {
    const c = new Circuit(2, [rail(1, -5), res(1, 2, 1000), { type: "varactor", nodes: [2, 0], props: { baseCapacitance: 4e-12 } }]);
    run(c, 1e-6, 1e-8);
    const r = readoutsOf(c.models[2], c.x);
    expect(c.x[2]).toBeCloseTo(-5, 3);
    expect(r.capacitance).toBeCloseTo(4e-12 / Math.sqrt(1 + 5 / 0.805904783), 14);
  });

  test("conducts forward like the Falstad default diode", () => {
    const c = new Circuit(2, [rail(1, 5), res(1, 2, 1000), { type: "varactor", nodes: [2, 0] }]);
    const x = c.step(dcStep);
    expect(x[2]).toBeGreaterThan(0.4);
    expect(x[2]).toBeLessThan(0.8);
  });
});

describe("polarized capacitor", () => {
  test("charges like an RC and flags reverse bias", () => {
    const c = new Circuit(2, [rail(1, 5), res(1, 2, 1000), { type: "polar-capacitor", nodes: [2, 0], props: { capacitance: 1e-6, initialVoltage: 0 } }]);
    run(c, 1e-3, 1e-6);
    expect(c.x[2]).toBeCloseTo(5 * (1 - Math.exp(-1)), 1);
    expect(readoutsOf(c.models[2], c.x).reverseOverLimit).toBe(0);
    const r = new Circuit(2, [rail(1, -5), res(1, 2, 10), { type: "polar-capacitor", nodes: [2, 0], props: { capacitance: 1e-6, maxReverseVoltage: 1 } }]);
    run(r, 1e-4, 1e-6);
    expect(readoutsOf(r.models[2], r.x).reverseOverLimit).toBe(1);
  });

  test("series resistance limits the charging current", () => {
    const c = new Circuit(1, [rail(1, 5), { type: "polar-capacitor", nodes: [1, 0], props: { capacitance: 1e-3, seriesResistance: 100 } }]);
    const x = c.step(tran(1e-6, 1e-6, "be"));
    expect(readoutsOf(c.models[1], x).current).toBeCloseTo(0.05, 3);
  });
});

describe("spark gap", () => {
  test("fires above breakdown and holds while current flows", () => {
    const gap = { type: "spark-gap", nodes: [2, 0], props: { breakdownVoltage: 100, onResistance: 10, offResistance: 1e9, holdingCurrent: 0.001 } };
    const off = new Circuit(2, [rail(1, 50), res(1, 2, 1000), gap]);
    run(off, 1e-5, 1e-6);
    expect(readoutsOf(off.models[2], off.x).conducting).toBe(0);
    const on = new Circuit(2, [rail(1, 200), res(1, 2, 1000), gap]);
    run(on, 1e-5, 1e-6);
    expect(readoutsOf(on.models[2], on.x).conducting).toBe(1);
    expect(on.x[2]).toBeCloseTo(200 * (10 / 1010), 3);
  });
});

describe("crystal", () => {
  test("blocks DC and rings at its series resonance", () => {
    const f = 1e6;
    const xtal = { type: "crystal", nodes: [2, 0], props: { frequency: f, seriesCapacitance: 1e-12, parallelCapacitance: 0, resistance: 1 } };
    const dc = new Circuit(2, [rail(1, 1), res(1, 2, 1000), xtal]);
    const x = dc.step(dcStep);
    expect(x[2]).toBeCloseTo(1, 6);
    // Ringing: start with the motional capacitor charged (state slot 4) and the terminals shorted by 0 Ω... via 1 Ω.
    const ring = new Circuit(1, [res(1, 0, 1), { ...xtal, nodes: [1, 0], savedState: [0, 0, 0, 0, 1, 0, 0] }]);
    const dt = 1 / f / 200;
    const crossings: number[] = [];
    let prev = 0;
    for (let k = 1; k <= 600; k++) {
      const s = ring.step(tran(k * dt, dt, "trap"));
      const i = readoutsOf(ring.models[1], s).current;
      if (k > 1 && Math.sign(i) !== Math.sign(prev) && prev !== 0) crossings.push(k * dt);
      prev = i;
    }
    expect(crossings.length).toBeGreaterThanOrEqual(4);
    const period = (2 * (crossings[crossings.length - 1] - crossings[0])) / (crossings.length - 1);
    expect(period * f).toBeCloseTo(1, 1);
  });
});

describe("thyristors", () => {
  test("SCR latches on a gate pulse and stays on", () => {
    // Anode 5 V through 100 Ω; gate driven from node 3.
    const specs = (gate: number) => [rail(1, 5), res(1, 2, 100), rail(3, gate), res(3, 4, 100), { type: "scr", nodes: [2, 0, 4] }];
    const off = new Circuit(4, specs(0));
    run(off, 1e-5, 1e-6);
    expect(readoutsOf(off.models[4], off.x).on).toBe(0);
    const fired = new Circuit(4, specs(5));
    run(fired, 1e-5, 1e-6);
    expect(readoutsOf(fired.models[4], fired.x).on).toBe(1);
    expect(fired.x[2]).toBeLessThan(1.2);
    // Gate removed: still conducting (anode current above holding).
    fired.models[2].setProps({ waveform: "dc", voltage: 0 });
    run(fired, 1e-5, 1e-6);
    expect(readoutsOf(fired.models[4], fired.x).on).toBe(1);
  });

  test("triac conducts both ways once triggered", () => {
    for (const v of [10, -10]) {
      const c = new Circuit(4, [rail(1, v), res(1, 2, 100), rail(3, Math.sign(v) * 5), res(3, 4, 100), { type: "triac", nodes: [2, 0, 4] }]);
      run(c, 1e-5, 1e-6);
      expect(readoutsOf(c.models[4], c.x).on).toBe(1);
      expect(Math.abs(c.x[2])).toBeLessThan(1.2);
    }
  });

  test("diac breaks over above its breakdown voltage", () => {
    const diac = { type: "diac", nodes: [2, 0], props: { breakdownVoltage: 30 } };
    const low = new Circuit(2, [rail(1, 20), res(1, 2, 1000), diac]);
    run(low, 1e-5, 1e-6);
    expect(readoutsOf(low.models[2], low.x).conducting).toBe(0);
    const high = new Circuit(2, [rail(1, -40), res(1, 2, 1000), diac]);
    run(high, 1e-5, 1e-6);
    expect(readoutsOf(high.models[2], high.x).conducting).toBe(1);
    expect(Math.abs(readoutsOf(high.models[2], high.x).current)).toBeGreaterThan(0.01);
  });
});

describe("triode", () => {
  test("Child-Langmuir plate current", () => {
    // Grid 1, plate 2, cathode ground.
    const c = new Circuit(2, [rail(1, -2), rail(2, 250), { type: "triode", nodes: [1, 2, 0], props: { mu: 93, kg1: 680 } }]);
    const x = c.step(dcStep);
    const r = readoutsOf(c.models[2], x);
    // plus TriodeElm's 1e-8 S plate leakage
    expect(r.ip).toBeCloseTo((-2 + 250 / 93) ** 1.5 / 680 + 250e-8, 8);
    expect(r.ig).toBeLessThan(1e-6);
    expect(triodeCurrents(-10, 250, 93, 680).ip).toBeLessThan(1e-5);
  });
});

describe("unijunction transistor", () => {
  test("blocks below the peak voltage and conducts above it", () => {
    // B2 at 10 V, B1 to ground through 47 Ω, emitter fed from a rail through 1 kΩ.
    const ujt = (ve: number) =>
      new Circuit(4, [rail(1, 10), res(2, 0, 47), rail(3, ve), res(3, 4, 1000), { type: "unijunction", nodes: [4, 2, 1] }]);
    const low = ujt(3);
    let x = low.step(dcStep);
    expect(readoutsOf(low.models[4], x).ie).toBeLessThan(1e-5);
    const high = ujt(12);
    x = high.step(dcStep);
    expect(readoutsOf(high.models[4], x).ie).toBeGreaterThan(5e-3);
  });
});

describe("antenna", () => {
  test("drives its terminal with AntennaElm's signal", () => {
    const c = new Circuit(1, [{ type: "antenna", nodes: [1] }, res(1, 0, 1000)]);
    for (const t of [1e-4, 3.3e-4, 1e-3]) {
      const x = c.step(tran(t, 1e-6, "be"));
      expect(x[1]).toBeCloseTo(antennaVoltage(t), 9);
    }
    expect(Math.abs(antennaVoltage(0.0123))).toBeLessThan(30);
  });
});
