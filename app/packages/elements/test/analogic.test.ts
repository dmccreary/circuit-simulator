// Behaviour of the "analogic" parts through the real engine: gyrator,
// tapped transformer, Darlington, OTA, Norton amp, split relay, three-phase
// motor, VCO, phase comparator, Schmitt triggers.
import { createEngine, type Engine } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import type { Netlist, NetlistElement, PropValue } from "@cs/model";

const settings = { realisticParts: false, realisticRatings: false, start: "zero" as const, seed: 1 };
type El = [string, string, number[], Record<string, PropValue>];

function engine(nodeCount: number, els: El[]): Engine {
  const elements: NetlistElement[] = els.map(([id, type, nodes, props]) => ({ id, type, nodes, props }));
  const nodeNames = ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)];
  const net: Netlist = { nodeCount, nodeNames, elements, settings };
  const e = createEngine(net, getModelFactory);
  expect(e.status).toBe("ok");
  return e;
}

function run(e: Engine, until: number, each?: (t: number, v: Float64Array) => void): void {
  for (let k = 0; e.time < until; k++) {
    if (!e.step().ok) throw new Error(`step failed at t=${e.time}: ${JSON.stringify(e.diagnostics)}`);
    e.drainSamples();
    each?.(e.time, e.displayState());
    if (k > 1e6) throw new Error("too many steps");
  }
}

const v = (e: Engine) => e.displayState();
const dc = (voltage: number): Record<string, PropValue> => ({ waveform: "dc", voltage });

describe("gyrator", () => {
  test("I1 = V2/R and I2 = -V1/R", () => {
    // 1 V on port 1; port 2 loaded by 1 kΩ: V2 = -R·I2... with R = 1 kΩ, I1 = V2/R.
    const e = engine(2, [
      ["V1", "rail", [1], dc(1)],
      ["G1", "gyrator", [1, 2, 0, 0], { resistance: 1000 }],
      ["RL", "resistor", [2, 0], { resistance: 2000 }],
    ]);
    // I2 (into 2+) = -V1/R = -1 mA, so V2 = -I2·RL... current into 2+ from RL is -V2/RL.
    expect(v(e)[2]).toBeCloseTo(2, 6);
    expect(e.readouts("G1").i1).toBeCloseTo(2e-3, 9);
  });

  test("a capacitor on port 2 makes port 1 an inductor (L = R²C)", () => {
    // Step 1 V into 1 kΩ + gyrator with 1 µF on port 2: L = 1 H, τ = L/R = 1 ms.
    const e = engine(3, [
      ["V1", "rail", [1], dc(1)],
      ["R1", "resistor", [1, 2], { resistance: 1000 }],
      ["G1", "gyrator", [2, 3, 0, 0], { resistance: 1000 }],
      ["C1", "capacitor", [3, 0], { capacitance: 1e-6 }],
    ]);
    let atTau = NaN;
    run(e, 3e-3, (t, x) => {
      if (Number.isNaN(atTau) && t >= 1e-3) atTau = x[2];
    });
    expect(atTau).toBeGreaterThan(0.3);
    expect(atTau).toBeLessThan(0.43); // e^-1 = 0.37 of the step across the "inductor"
    expect(v(e)[2]).toBeLessThan(0.1);
  });
});

describe("tapped transformer", () => {
  test("each half of the secondary carries half the voltage", () => {
    const e = engine(4, [
      ["V1", "ac-source", [1, 0], { amplitude: 10, frequency: 50 }],
      ["T1", "tapped-transformer", [1, 0, 2, 3, 4], { inductance: 4, ratio: 2, coupling: 0.999 }],
      ["R1", "resistor", [2, 3], { resistance: 1e6 }],
      ["R2", "resistor", [3, 4], { resistance: 1e6 }],
      ["Rg", "resistor", [3, 0], { resistance: 1e6 }],
    ]);
    let top = 0;
    let bottom = 0;
    run(e, 0.04, (_t, x) => {
      top = Math.max(top, x[2] - x[3]);
      bottom = Math.max(bottom, x[3] - x[4]);
    });
    expect(top).toBeCloseTo(10, 0);
    expect(bottom).toBeCloseTo(10, 0);
  });
});

describe("Darlington pair", () => {
  test("current gain is about beta squared", () => {
    const e = engine(3, [
      ["Vcc", "rail", [1], dc(10)],
      ["Vb", "rail", [2], dc(5)],
      ["Rb", "resistor", [2, 3], { resistance: 1e7 }],
      ["Q1", "npn-darlington", [3, 1, 0], { beta: 100 }],
    ]);
    const r = e.readouts("Q1");
    expect(r.ic / r.ib).toBeGreaterThan(5000);
    expect(r.vbe).toBeGreaterThan(1);
    expect(r.vbe).toBeLessThan(1.6);
  });
});

describe("OTA", () => {
  test("output current follows Iabc·tanh(vd/2Vt) and its sign", () => {
    for (const vd of [-0.02, 0.02]) {
      // Iabc input fed from +9 V through 100 kΩ (about 80 µA), output into a 1 kΩ load.
      const e = engine(4, [
        ["Vp", "rail", [1], dc(vd)],
        ["Rabc", "resistor", [2, 3], { resistance: 1e5 }],
        ["V9", "rail", [2], dc(9)],
        ["U1", "ota", [1, 0, 0, 3, 4], {}],
        ["RL", "resistor", [4, 0], { resistance: 1000 }],
      ]);
      const iout = e.readouts("U1").outputCurrent;
      expect(Math.sign(iout)).toBe(Math.sign(vd));
      expect(Math.abs(iout)).toBeGreaterThan(1e-5);
      expect(Math.abs(iout)).toBeLessThan(1e-4);
    }
  });
});

describe("Norton amplifier", () => {
  test("inverting amplifier biased from the + input", () => {
    // in- 1 , in+ 2, out 3; 500 kΩ feedback, 500 kΩ from 6 V into in+: out = 6 V at rest.
    const e = engine(4, [
      ["U1", "norton-amp", [2, 1, 3], {}],
      ["Rf", "resistor", [3, 1], { resistance: 5e5 }],
      ["Rb", "resistor", [4, 2], { resistance: 5e5 }],
      ["V", "rail", [4], dc(6)],
    ]);
    run(e, 1e-3); // the output stage starts at 0 V and settles within microseconds
    expect(v(e)[3]).toBeCloseTo(5.46, 1);
    expect(Math.abs(v(e)[1])).toBeLessThan(1e-3);
  });
});

describe("split relay (coil + contact)", () => {
  test("a latching coil toggles its contact on each pulse", () => {
    // Coil 1 -> GND driven by a 5 V rail through a push button; contact feeds a lamp load.
    const e = engine(5, [
      ["V1", "rail", [2], dc(5)],
      ["S1", "push-button", [2, 1], { pressed: false }],
      ["K1", "relay-coil", [1, 0, 3], { coilType: "latching", initiallyOn: false }],
      ["K2", "relay-contact", [4, 5, 3], {}],
      ["V2", "rail", [4], dc(1)],
      ["RL", "resistor", [5, 0], { resistance: 100 }],
    ]);
    expect(v(e)[5]).toBeLessThan(0.01);
    const pulse = (closed: boolean) => {
      e.setParams([{ element: "S1", param: "pressed", value: closed }]);
      run(e, e.time + 0.05);
    };
    pulse(true);
    pulse(false);
    expect(v(e)[5]).toBeGreaterThan(0.99);
    pulse(true);
    pulse(false);
    expect(v(e)[5]).toBeLessThan(0.01);
  });
});

describe("three-phase motor", () => {
  test("a star-connected motor on three phases spins up", () => {
    const phase = (deg: number): Record<string, PropValue> => ({ waveform: "ac", voltage: 220, frequency: 50, phase: deg });
    const e = engine(4, [
      ["VU", "rail", [1], phase(0)],
      ["VV", "rail", [2], phase(-120)],
      ["VW", "rail", [3], phase(120)],
      ["M1", "three-phase-motor", [1, 4, 2, 4, 3, 4], { inertia: 0.067, statorResistance: 0.067, rotorResistance: 0.032 }],
    ]);
    run(e, 0.2);
    expect(Math.abs(e.readouts("M1").speed)).toBeGreaterThan(100);
  });
});

describe("VCO and phase comparator", () => {
  test("VCO frequency rises with the control voltage", () => {
    const freq = (vin: number) => {
      const e = engine(6, [
        ["Vi", "rail", [1], dc(vin)],
        ["U1", "vco", [1, 2, 3, 4, 5, 6], {}],
        ["C1", "capacitor", [3, 4], { capacitance: 1e-6 }],
        ["R1", "resistor", [5, 0], { resistance: 4000 }],
        ["R2", "resistor", [6, 0], { resistance: 1e5 }],
      ]);
      let rises = 0;
      let last = 0;
      run(e, 0.1, (_t, x) => {
        if (last < 2.5 && x[2] >= 2.5) rises++;
        last = x[2];
      });
      return rises / 0.1;
    };
    const f1 = freq(1);
    const f3 = freq(3);
    expect(f1).toBeGreaterThan(20);
    expect(f3).toBeGreaterThan(2 * f1);
  });

  test("phase comparator: an edge on I1 drives high, one on I2 drives low", () => {
    const e = engine(3, [
      ["V1", "rail", [1], dc(0)],
      ["V2", "rail", [2], dc(0)],
      ["U1", "phase-comparator", [1, 2, 3], {}],
      ["R1", "resistor", [3, 0], { resistance: 1e5 }],
    ]);
    e.setParams([{ element: "V1", param: "voltage", value: 5 }]);
    run(e, 1e-3);
    expect(v(e)[3]).toBeCloseTo(5, 3);
    e.setParams([{ element: "V2", param: "voltage", value: 5 }]);
    run(e, 2e-3);
    expect(Math.abs(v(e)[3])).toBeLessThan(1e-3); // both risen: floating, pulled to 0 by R1
  });
});

describe("Schmitt triggers", () => {
  test("switch with hysteresis, inverting and not", () => {
    for (const [type, inverted] of [["schmitt-trigger", false], ["inverting-schmitt-trigger", true]] as const) {
      const e = engine(2, [
        ["Vin", "rail", [1], { waveform: "triangle", voltage: 2.5, offset: 2.5, frequency: 100 }],
        ["U1", type, [1, 2], {}],
      ]);
      let upAt = NaN;
      let last = inverted ? 5 : 0;
      run(e, 0.01, (_t, x) => {
        const rising = inverted ? last > 2.5 && x[2] < 2.5 : last < 2.5 && x[2] > 2.5;
        if (rising && Number.isNaN(upAt)) upAt = x[1];
        last = x[2];
      });
      expect(upAt).toBeGreaterThan(3.2);
      expect(upAt).toBeLessThan(3.6);
    }
  });
});
