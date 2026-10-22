// Analog semiconductor, amplifier, and coupled-part circuits run headless
// through the real engine and element models, checked against hand analysis.
import { createEngine, type Engine } from "@cs/engine";
import { createPartResolver } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { importFalstad } from "@cs/formats";
import { compile, type Netlist, type NetlistElement, type PropValue } from "@cs/model";

const settings = { realisticParts: false, realisticRatings: false, start: "zero" as const, seed: 1 };
const VT = 0.025852;

type El = [string, string, number[], Record<string, PropValue>];

function netlist(nodeCount: number, els: El[]): Netlist {
  const elements: NetlistElement[] = els.map(([id, type, nodes, props]) => ({ id, type, nodes, props }));
  const nodeNames = ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)];
  return { nodeCount, nodeNames, elements, settings };
}

/** Engine solved at t = 0; node voltages by index. */
function solve(nodeCount: number, els: El[]): { v: Float64Array; e: Engine } {
  const e = createEngine(netlist(nodeCount, els), getModelFactory);
  expect(e.status).toBe("ok");
  return { v: e.displayState(), e };
}

const within = (actual: number, expected: number, rel: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(rel * Math.abs(expected));

describe("bipolar transistors", () => {
  test("common-emitter bias point is within 5% of the hand calculation", () => {
    const [vcc, r1, r2, rc, re, beta, is] = [12, 100e3, 20e3, 4700, 1000, 100, 1e-14];
    const { v, e } = solve(4, [
      ["V1", "battery", [1, 0], { voltage: vcc }],
      ["R1", "resistor", [1, 2], { resistance: r1 }],
      ["R2", "resistor", [2, 0], { resistance: r2 }],
      ["RC", "resistor", [1, 3], { resistance: rc }],
      ["RE", "resistor", [4, 0], { resistance: re }],
      ["Q1", "npn-transistor", [2, 3, 4], { beta, saturationCurrent: is }],
    ]);
    // Thevenin base drive; Vbe from the Shockley law at the resulting current.
    const vth = (vcc * r2) / (r1 + r2);
    const rth = (r1 * r2) / (r1 + r2);
    let ic = 1e-3;
    for (let k = 0; k < 20; k++) {
      const vbe = VT * Math.log(ic / is);
      ic = (beta / (beta + 1)) * ((vth - vbe) / (re + rth / (beta + 1)));
    }
    const icSim = (vcc - v[3]) / rc;
    within(icSim, ic, 0.05);
    within(v[4], ((beta + 1) / beta) * ic * re, 0.05);
    const r = e.readouts("Q1");
    expect(r.region).toBe(1); // forward active
    within(r.gain, beta, 0.02);
    within(r.ic, icSim, 1e-3);
  });

  test("an NPN switch saturates with Vce well under 0.2 V", () => {
    const { v, e } = solve(3, [
      ["V1", "battery", [1, 0], { voltage: 5 }],
      ["RB", "resistor", [1, 2], { resistance: 10e3 }],
      ["RC", "resistor", [1, 3], { resistance: 1000 }],
      ["Q1", "npn-transistor", [2, 3, 0], {}],
    ]);
    expect(v[3]).toBeGreaterThan(0);
    expect(v[3]).toBeLessThan(0.2);
    expect(v[2]).toBeGreaterThan(0.6);
    expect(v[2]).toBeLessThan(0.85);
    expect(e.readouts("Q1").region).toBe(2);
  });

  test("an NPN switch with no base drive is cut off", () => {
    const { v, e } = solve(3, [
      ["V1", "battery", [1, 0], { voltage: 5 }],
      ["RB", "resistor", [2, 0], { resistance: 10e3 }],
      ["RC", "resistor", [1, 3], { resistance: 1000 }],
      ["Q1", "npn-transistor", [2, 3, 0], {}],
    ]);
    expect(v[3]).toBeGreaterThan(4.99);
    expect(e.readouts("Q1").region).toBe(0);
  });

  test("a PNP high-side switch saturates", () => {
    // Emitter at +5 V, base pulled to ground through 10 kΩ, load to ground.
    const { v } = solve(3, [
      ["V1", "battery", [1, 0], { voltage: 5 }],
      ["RB", "resistor", [2, 0], { resistance: 10e3 }],
      ["RL", "resistor", [3, 0], { resistance: 1000 }],
      ["Q1", "pnp-transistor", [2, 3, 1], {}],
    ]);
    expect(v[3]).toBeGreaterThan(4.8);
    expect(v[3]).toBeLessThan(5);
  });
});

describe("MOSFETs", () => {
  const inverter = (vin: number) =>
    solve(3, [
      ["VDD", "battery", [1, 0], { voltage: 5 }],
      ["VIN", "dc-source", [2, 0], { voltage: vin }],
      ["MP", "p-mosfet", [2, 3, 1], {}],
      ["MN", "n-mosfet", [2, 3, 0], {}],
    ]).v[3];

  test("a CMOS inverter has a falling transfer curve from rail to rail", () => {
    const vins = [0, 0.5, 1, 1.5, 2, 2.2, 2.8, 3, 3.5, 4, 4.5, 5];
    const vouts = vins.map(inverter);
    expect(vouts[0]).toBeGreaterThan(4.999);
    expect(vouts[vouts.length - 1]).toBeLessThan(0.001);
    for (let i = 1; i < vouts.length; i++) expect(vouts[i]).toBeLessThanOrEqual(vouts[i - 1] + 1e-9);
    expect(inverter(2.2)).toBeGreaterThan(4);
    expect(inverter(2.8)).toBeLessThan(1);
  });

  test("an NMOS with a drain resistor matches the square law in saturation", () => {
    // Vgs = 2 V: Id = beta/2·(0.5)² = 2.5 mA, Vd = 10 - 2.5 = 7.5 V (saturated since Vds > 0.5).
    const { v, e } = solve(3, [
      ["VDD", "battery", [1, 0], { voltage: 10 }],
      ["VG", "dc-source", [2, 0], { voltage: 2 }],
      ["RD", "resistor", [1, 3], { resistance: 1000 }],
      ["M1", "n-mosfet", [2, 3, 0], { threshold: 1.5, beta: 0.02 }],
    ]);
    within(v[3], 7.5, 1e-3);
    expect(e.readouts("M1").region).toBe(2);
  });
});

describe("op-amps", () => {
  test("inverting amplifier has gain -10 within 1%", () => {
    for (const vin of [0.5, -0.3]) {
      const { v } = solve(3, [
        ["VIN", "dc-source", [1, 0], { voltage: vin }],
        ["RIN", "resistor", [1, 2], { resistance: 1000 }],
        ["RF", "resistor", [2, 3], { resistance: 10e3 }],
        ["U1", "op-amp", [2, 0, 3], {}],
      ]);
      within(v[3] / vin, -10, 0.01);
    }
  });

  test("non-inverting amplifier has gain 1 + Rf/Rg", () => {
    const { v } = solve(3, [
      ["VIN", "dc-source", [1, 0], { voltage: 0.4 }],
      ["RG", "resistor", [2, 0], { resistance: 1000 }],
      ["RF", "resistor", [2, 3], { resistance: 4700 }],
      ["U1", "op-amp", [2, 1, 3], {}],
    ]);
    within(v[3], 0.4 * 5.7, 0.01);
  });

  test("an inverting amplifier driven past the rails clips at the rail", () => {
    const { v, e } = solve(3, [
      ["VIN", "dc-source", [1, 0], { voltage: 3 }],
      ["RIN", "resistor", [1, 2], { resistance: 1000 }],
      ["RF", "resistor", [2, 3], { resistance: 10e3 }],
      ["U1", "op-amp", [2, 0, 3], {}],
    ]);
    within(v[3], -15, 0.001);
    expect(e.readouts("U1").saturated).toBe(1);
  });

  test("a comparator swings to its rails", () => {
    const compare = (vplus: number, vminus: number, rails: Record<string, PropValue>) =>
      solve(3, [
        ["VP", "dc-source", [1, 0], { voltage: vplus }],
        ["VM", "dc-source", [2, 0], { voltage: vminus }],
        ["RL", "resistor", [3, 0], { resistance: 10e3 }],
        ["U1", "op-amp", [2, 1, 3], rails],
      ]).v[3];
    within(compare(2, 1, {}), 15, 1e-3);
    within(compare(1, 2, {}), -15, 1e-3);
    within(compare(2.6, 2.5, { maxOutput: 5, minOutput: 0 }), 5, 1e-3);
    expect(Math.abs(compare(2.5, 2.6, { maxOutput: 5, minOutput: 0 }))).toBeLessThan(5e-3);
  });
});

describe("zener diode", () => {
  test("a zener shunt regulator holds its output near the zener voltage", () => {
    const reg = (vin: number) =>
      solve(2, [
        ["V1", "battery", [1, 0], { voltage: vin }],
        ["RS", "resistor", [1, 2], { resistance: 1000 }],
        ["RL", "resistor", [2, 0], { resistance: 10e3 }],
        ["DZ", "zener-diode", [0, 2], { zenerVoltage: 5.6 }],
      ]);
    const lo = reg(12);
    const hi = reg(15);
    within(lo.v[2], 5.6, 0.02);
    expect(hi.v[2] - lo.v[2]).toBeLessThan(0.05);
    expect(lo.e.readouts("DZ").state).toBe(2);
  });

  test("forward biased, a zener behaves as an ordinary diode", () => {
    const { v } = solve(2, [
      ["V1", "battery", [1, 0], { voltage: 5 }],
      ["R1", "resistor", [1, 2], { resistance: 1000 }],
      ["DZ", "zener-diode", [2, 0], {}],
    ]);
    expect(v[2]).toBeGreaterThan(0.55);
    expect(v[2]).toBeLessThan(0.75);
  });
});

describe("controlled sources", () => {
  test("each dependent source scales its control by its gain", () => {
    // Control: 1 V across 1 kΩ (1 mA). Output into a 1 kΩ load.
    const out = (type: string, gain: number) => {
      const { v } = solve(3, [
        ["V1", "battery", [1, 0], { voltage: 1 }],
        ["RC", "resistor", [2, 0], { resistance: 1000 }],
        ["RL", "resistor", [3, 0], { resistance: 1000 }],
        ["X1", type, [1, 2, 3, 0], { gain }],
      ]);
      return v[3];
    };
    // Voltage control sees V(1,2): with the 1 kΩ open on the VC port, node 2 sits at 0 V.
    within(out("vcvs", 3), 3, 1e-9);
    within(out("vccs", 0.002), -2, 1e-9); // 2 mA into O+ through the source: -2 V across the load
    within(out("ccvs", 2000), 2, 1e-9); // 1 mA control
    within(out("cccs", 5), -5, 1e-9);
  });
});

describe("transformer", () => {
  test("a 2:1 step-down transformer halves an AC voltage", () => {
    const e = createEngine(
      netlist(2, [
        ["V1", "ac-source", [1, 0], { amplitude: 10, frequency: 60, offset: 0, phase: 0 }],
        ["T1", "transformer", [1, 0, 2, 0], { inductance: 4, ratio: 0.5, coupling: 0.999 }],
        ["RL", "resistor", [2, 0], { resistance: 1000 }],
      ]),
      getModelFactory,
    );
    e.setChannels([{ id: "out", kind: "voltage", a: 2, b: 0 }]);
    const times: number[] = [];
    const values: number[] = [];
    while (e.time < 3 / 60) {
      const outcome = e.step();
      if (!outcome.ok) throw new Error(`step failed at t=${e.time}`);
      const block = e.drainSamples();
      times.push(...block.times);
      values.push(...block.samples.subarray(0, block.times.length));
    }
    const last = values.filter((_, i) => times[i] >= 2 / 60);
    within(Math.max(...last), 5, 0.02);
    within(-Math.min(...last), 5, 0.02);
  });
});

describe("transient runs", () => {
  function runTo(e: Engine, until: number): { t: number[]; y: number[] } {
    const t: number[] = [];
    const y: number[] = [];
    while (e.time < until) {
      const outcome = e.step();
      if (!outcome.ok) throw new Error(`step failed at t=${e.time}: ${JSON.stringify(e.diagnostics)}`);
      const block = e.drainSamples();
      t.push(...block.times);
      y.push(...block.samples.subarray(0, block.times.length));
    }
    return { t, y };
  }

  test("an inverting amplifier follows a sine with gain -10", () => {
    const e = createEngine(
      netlist(3, [
        ["VIN", "ac-source", [1, 0], { amplitude: 1, frequency: 1000, offset: 0, phase: 0 }],
        ["RIN", "resistor", [1, 2], { resistance: 1000 }],
        ["RF", "resistor", [2, 3], { resistance: 10e3 }],
        ["U1", "op-amp", [2, 0, 3], {}],
      ]),
      getModelFactory,
    );
    e.setChannels([{ id: "out", kind: "voltage", a: 3, b: 0 }]);
    const { y } = runTo(e, 2e-3);
    within(Math.max(...y), 10, 0.01);
    within(Math.min(...y), -10, 0.01);
  });

  test("a common-emitter amplifier with a bypassed emitter amplifies and inverts", () => {
    // Base biased straight from the source's offset; |Av| ≈ gm·RC ≈ 200.
    // (Coupling capacitors are left out: see the time-scale note in the report.)
    const e = createEngine(
      {
        ...netlist(4, [
          ["V1", "battery", [1, 0], { voltage: 12 }],
          ["VIN", "ac-source", [2, 0], { amplitude: 0.002, frequency: 1000, offset: 1.81, phase: 0 }],
          ["RC", "resistor", [1, 3], { resistance: 4700 }],
          ["RE", "resistor", [4, 0], { resistance: 1000 }],
          ["CE", "capacitor", [4, 0], { capacitance: 100e-6 }],
          ["Q1", "npn-transistor", [2, 3, 4], {}],
        ]),
        settings: { ...settings, start: "steady" as const },
      },
      getModelFactory,
    );
    expect(e.status).toBe("ok");
    e.setChannels([
      { id: "c", kind: "voltage", a: 3, b: 0 },
      { id: "in", kind: "voltage", a: 2, b: 0 },
    ]);
    const c: number[] = [];
    const vin: number[] = [];
    while (e.time < 3e-3) {
      const outcome = e.step();
      if (!outcome.ok) throw new Error(`step failed at t=${e.time}: ${JSON.stringify(e.diagnostics)}`);
      const block = e.drainSamples();
      const n = block.times.length; // channel-major
      c.push(...block.samples.subarray(0, n));
      vin.push(...block.samples.subarray(n, 2 * n));
    }
    const tail = (a: number[]) => a.slice(Math.floor(a.length / 2));
    const swing = Math.max(...tail(c)) - Math.min(...tail(c));
    const inSwing = Math.max(...tail(vin)) - Math.min(...tail(vin));
    expect(swing / inSwing).toBeGreaterThan(100);
    expect(swing / inSwing).toBeLessThan(300);
    // Inverting: the collector is lowest where the input is highest.
    const iMax = tail(vin).indexOf(Math.max(...tail(vin)));
    expect(tail(c)[iMax]).toBeLessThan(Math.min(...tail(c)) + 0.2 * swing);
  });

  test("a divider-biased common-emitter stage with coupling capacitors runs and amplifies", () => {
    const e = createEngine(
      {
        ...netlist(6, [
          ["VCC", "battery", [1, 0], { voltage: 12 }],
          ["VIN", "ac-source", [2, 0], { amplitude: 0.005, frequency: 1000, offset: 0, phase: 0 }],
          ["CIN", "capacitor", [2, 3], { capacitance: 10e-6 }],
          ["R1", "resistor", [1, 3], { resistance: 47000 }],
          ["R2", "resistor", [3, 0], { resistance: 10000 }],
          ["RC", "resistor", [1, 4], { resistance: 4700 }],
          ["RE", "resistor", [5, 0], { resistance: 1000 }],
          ["CE", "capacitor", [5, 0], { capacitance: 100e-6 }],
          ["COUT", "capacitor", [4, 6], { capacitance: 10e-6 }],
          ["RL", "resistor", [6, 0], { resistance: 10000 }],
          ["Q1", "npn-transistor", [3, 4, 5], {}],
        ]),
        settings: { ...settings, start: "steady" as const },
      },
      getModelFactory,
    );
    expect(e.status).toBe("ok");
    expect(e.timeScales.fastest).toBeGreaterThan(1e-9);
    e.setChannels([{ id: "out", kind: "voltage", a: 6, b: 0 }]);
    const out: number[] = [];
    while (e.time < 5e-3) {
      const outcome = e.step();
      if (!outcome.ok) throw new Error(`step failed at t=${e.time}: ${JSON.stringify(e.diagnostics)}`);
      const block = e.drainSamples();
      out.push(...block.samples.subarray(0, block.times.length));
    }
    const tail = out.slice(Math.floor(out.length * 0.6));
    const swing = Math.max(...tail) - Math.min(...tail);
    expect(swing / 0.01).toBeGreaterThan(50);
  });
});

// Example circuits from CircuitJS1 (Paul Falstad, GPL-2.0-or-later):
// src/com/lushprojects/circuitjs1/public/circuits/amp-invert.txt and transformer.txt
// in https://github.com/pfalstad/circuitjs1. Scope lines are dropped.
const AMP_INVERT_TXT = `$ 1 5.0E-6 10 57 5.0
v 96 256 96 112 0 1 40.0 5.0 0.0
g 96 256 96 304 0
r 96 112 192 112 0 1000.0
r 192 144 336 144 0 3000.0
w 336 144 336 192 0
w 192 112 192 144 0
w 192 144 192 176 0
w 96 256 192 256 0
w 192 208 192 256 0
a 192 192 336 192 0
O 336 192 400 192 0
`;

const TRANSFORMER_TXT = `$ 1 0.000005 9.001713130052181 54 5 50
v 176 272 176 144 0 1 60 10 0 0 0.5
w 352 224 352 272 0
T 272 192 352 192 0 100 1 0 0 0.999
w 272 192 272 144 0
w 272 224 272 272 0
r 272 144 176 144 0 0.1
w 176 272 272 272 0
w 352 272 448 272 0
w 352 144 448 144 0
r 448 144 448 272 0 1000
w 352 192 352 144 0
g 176 272 176 288 0
g 352 272 352 288 0
`;

describe("Falstad imports", () => {
  function load(text: string) {
    const { doc } = importFalstad(text);
    const compiled = compile(doc, createPartResolver());
    expect(compiled.diagnostics.filter((d) => d.severity === "error" && d.id !== "placeholder")).toEqual([]);
    const idOf = (type: string) => Object.values(doc.parts).find((p) => p.type === type)!.id;
    return { e: createEngine(compiled.netlist, getModelFactory), idOf };
  }

  test("amp-invert.txt: the op-amp's pins land on Falstad's wires and the gain is -3", () => {
    const { e, idOf } = load(AMP_INVERT_TXT);
    const amp = idOf("op-amp");
    const src = idOf("ac-source");
    let checked = 0;
    for (let i = 0; i < 300 && e.time < 0.02; i++) {
      expect(e.step().ok).toBe(true);
      const r = e.readouts(amp);
      const vin = e.readouts(src).voltage;
      if (Math.abs(r.vOut) < 14 && Math.abs(vin) > 0.5) {
        within(r.vOut, -3 * vin, 0.01);
        checked++;
      }
      expect(Math.abs(r.vMinus)).toBeLessThan(1e-3); // virtual ground: "-" is wired to the resistors
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("transformer.txt: a 1:1 transformer passes the primary voltage to its load", () => {
    const { e, idOf } = load(TRANSFORMER_TXT);
    const t = idOf("transformer");
    let peak = 0;
    while (e.time < 3 / 60) {
      expect(e.step().ok).toBe(true);
      const r = e.readouts(t);
      if (e.time > 2 / 60) peak = Math.max(peak, r.secondaryVoltage);
    }
    // Leakage 2(1-k)L ≈ 0.2 H is 75 Ω at 60 Hz against the 1 kΩ load: 0.3% drop, 4° lag.
    within(peak, 10, 0.02);
  });
});
