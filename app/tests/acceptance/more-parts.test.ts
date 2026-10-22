// Parts added for Falstad compatibility, run headless through the real engine:
// rails and waveform sources, 555 timer, relay, analog switches, SPDT switch,
// transmission line, memristor, current conveyor, and wide logic gates.
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

/** Step until `until`, calling `each` with the time and node voltages after every step. */
function run(e: Engine, until: number, each?: (t: number, v: Float64Array) => void): void {
  for (let k = 0; e.time < until; k++) {
    const out = e.step();
    if (!out.ok) throw new Error(`step failed at t=${e.time}: ${JSON.stringify(e.diagnostics)}`);
    e.drainSamples();
    each?.(e.time, e.displayState());
    if (k > 2e6) throw new Error("too many steps");
  }
}

const v = (e: Engine) => e.displayState();

describe("rails and waveform sources", () => {
  test("a DC rail holds its node against ground", () => {
    const e = engine(1, [
      ["V1", "rail", [1], { waveform: "dc", voltage: 4, offset: 1 }],
      ["R1", "resistor", [1, 0], { resistance: 1000 }],
    ]);
    expect(v(e)[1]).toBeCloseTo(5, 6);
    expect(e.readouts("V1").current).toBeCloseTo(0.005, 6);
  });

  test("a triangle source follows VoltageElm's waveform", () => {
    const e = engine(1, [
      ["V1", "waveform-source", [1, 0], { waveform: "triangle", voltage: 2, frequency: 100, offset: 0 }],
      ["R1", "resistor", [1, 0], { resistance: 1000 }],
    ]);
    let peak = -Infinity;
    let trough = Infinity;
    run(e, 0.02, (_t, x) => {
      peak = Math.max(peak, x[1]);
      trough = Math.min(trough, x[1]);
    });
    expect(peak).toBeCloseTo(2, 1);
    expect(trough).toBeCloseTo(-2, 1);
  });
});

describe("555 timer", () => {
  test("astable: frequency within 10% of 1.44 / ((R1 + 2·R2)·C)", () => {
    const [r1, r2, c] = [1000, 10000, 1e-7];
    // 1 Vcc, 2 dis, 3 trig/thres, 4 out, 5 ctl
    const e = engine(5, [
      ["V1", "battery", [1, 0], { voltage: 5 }],
      ["R1", "resistor", [1, 2], { resistance: r1 }],
      ["R2", "resistor", [2, 3], { resistance: r2 }],
      ["C1", "capacitor", [3, 0], { capacitance: c }],
      ["U1", "timer-555", [2, 3, 3, 1, 5, 4, 1, 0], {}],
      ["RL", "resistor", [4, 0], { resistance: 10000 }],
    ]);
    const rises: number[] = [];
    let last = 0;
    run(e, 0.02, (t, x) => {
      if (last < 2.5 && x[4] >= 2.5) rises.push(t);
      last = x[4];
    });
    const periods = rises.slice(2).map((t, i) => t - rises[i + 1]);
    const f = 1 / (periods.reduce((a, b) => a + b, 0) / periods.length);
    const expected = 1.44 / ((r1 + 2 * r2) * c);
    expect(Math.abs(f - expected) / expected).toBeLessThan(0.1);
  });
});

describe("relay", () => {
  test("coil current above onCurrent moves the common terminal from A to B", () => {
    // 1 coil supply, 2 common (5 V), 3 throw A, 4 throw B
    const e = engine(4, [
      ["V1", "battery", [1, 0], { voltage: 5 }],
      ["V2", "battery", [2, 0], { voltage: 5 }],
      ["K1", "relay", [2, 3, 4, 1, 0], { coilInductance: 0.01, coilResistance: 50, onCurrent: 0.02, switchingTime: 0.001 }],
      ["RA", "resistor", [3, 0], { resistance: 1000 }],
      ["RB", "resistor", [4, 0], { resistance: 1000 }],
    ]);
    expect(e.readouts("K1").position).toBe(0);
    expect(v(e)[3]).toBeGreaterThan(4.9);
    run(e, 0.01);
    expect(e.readouts("K1").position).toBe(1);
    expect(e.readouts("K1").coilCurrent).toBeCloseTo(0.1, 3);
    expect(v(e)[4]).toBeGreaterThan(4.9);
    expect(v(e)[3]).toBeLessThan(0.01);
  });
});

describe("switches", () => {
  test("an analog switch closes when its control is above threshold", () => {
    // 1 in, 2 out, 3 control
    const e = engine(3, [
      ["V1", "battery", [1, 0], { voltage: 3 }],
      ["VC", "rail", [3], { voltage: 5 }],
      ["S1", "analog-switch", [1, 2, 3], { onResistance: 20 }],
      ["RL", "resistor", [2, 0], { resistance: 980 }],
    ]);
    run(e, 1e-4);
    expect(v(e)[2]).toBeCloseTo(3 * 0.98, 2);
  });

  test("an analog changeover switch picks throw B while the control is low", () => {
    const e = engine(4, [
      ["V1", "battery", [1, 0], { voltage: 3 }],
      ["S1", "analog-switch-2", [1, 2, 3, 4], {}],
      ["RA", "resistor", [2, 0], { resistance: 1000 }],
      ["RB", "resistor", [3, 0], { resistance: 1000 }],
      ["RC", "resistor", [4, 0], { resistance: 1000 }],
    ]);
    run(e, 1e-4);
    expect(v(e)[3]).toBeGreaterThan(2.9);
    expect(v(e)[2]).toBeLessThan(0.01);
  });

  test("an SPDT switch joins the common terminal to the selected throw", () => {
    const make = (thrown: boolean) =>
      engine(3, [
        ["V1", "battery", [1, 0], { voltage: 5 }],
        ["S1", "spdt-switch", [1, 2, 3], { thrown }],
        ["RA", "resistor", [2, 0], { resistance: 1000 }],
        ["RB", "resistor", [3, 0], { resistance: 1000 }],
      ]);
    expect(v(make(false))[2]).toBeCloseTo(5, 3);
    expect(v(make(false))[3]).toBeCloseTo(0, 3);
    expect(v(make(true))[3]).toBeCloseTo(5, 3);
  });
});

describe("transmission line", () => {
  test("a matched line delivers half the step after its delay", () => {
    const T = 1e-6;
    // 1 source, 2 near end, 3 far end
    const e = engine(3, [
      ["V1", "battery", [1, 0], { voltage: 2 }],
      ["RS", "resistor", [1, 2], { resistance: 50 }],
      ["TL", "transmission-line", [2, 3, 0, 0], { delay: T, impedance: 50 }],
      ["RL", "resistor", [3, 0], { resistance: 50 }],
    ]);
    // At t = 0 the wave has only entered the near end.
    expect(v(e)[2]).toBeCloseTo(1, 6);
    expect(Math.abs(v(e)[3])).toBeLessThan(1e-9);
    const arrivals: number[] = [];
    run(e, 3 * T, (t, x) => {
      if (x[3] > 0.5) arrivals.push(t);
    });
    expect(arrivals[0]).toBeGreaterThanOrEqual(T * (1 - 1e-9));
    expect(v(e)[3]).toBeCloseTo(1, 4);
  });
});

describe("memristor and current conveyor", () => {
  test("a memristor's resistance falls while current flows into terminal 0", () => {
    const e = engine(1, [
      ["V1", "battery", [1, 0], { voltage: 1 }],
      ["M1", "memristor", [1, 0], { onResistance: 100, offResistance: 16000, totalWidth: 1e-8, mobility: 1e-10 }],
    ]);
    const r0 = e.readouts("M1").resistance;
    run(e, 0.05);
    expect(e.readouts("M1").resistance).toBeLessThan(r0);
  });

  test("CCII+: X follows Y, and Z carries the current into X", () => {
    // 1 Y, 2 X, 3 Z
    const e = engine(3, [
      ["VY", "rail", [1], { voltage: 1 }],
      ["RX", "resistor", [2, 0], { resistance: 1000 }],
      ["U1", "current-conveyor", [2, 1, 3], { gain: 1 }],
      ["RZ", "resistor", [3, 0], { resistance: 2000 }],
    ]);
    expect(v(e)[2]).toBeCloseTo(1, 6);
    expect(e.readouts("U1").ix).toBeCloseTo(-0.001, 9);
    expect(v(e)[3]).toBeCloseTo(2, 6);
  });
});

describe("wide gates", () => {
  test("a 3-input AND gate is high only with all inputs high", () => {
    const out = (a: boolean, b: boolean, c: boolean) => {
      const e = engine(4, [
        ["A", "logic-input", [1], { high: a }],
        ["B", "logic-input", [2], { high: b }],
        ["C", "logic-input", [3], { high: c }],
        ["U1", "and-gate-3", [1, 2, 3, 4], {}],
        ["RL", "resistor", [4, 0], { resistance: 1e6 }],
      ]);
      run(e, 1e-6);
      return v(e)[4];
    };
    expect(out(true, true, true)).toBeGreaterThan(4.9);
    expect(out(true, false, true)).toBeLessThan(0.1);
  });
});

describe("expression sources", () => {
  // Terminals: inputs A..H (0..7), then "+" (8) and "-" (9). Unused inputs go to spare nodes.
  const pins = (inputs: number[], plus: number, minus: number, spare: number) => [
    ...inputs,
    ...Array.from({ length: 8 - inputs.length }, (_, k) => spare + k),
    plus,
    minus,
  ];

  test("VCVS: the output follows the formula of its inputs", () => {
    const e = engine(10, [
      ["VA", "rail", [1], { voltage: 1.5 }],
      ["VB", "rail", [2], { voltage: 0.5 }],
      ["B1", "expression-source", pins([1, 2], 3, 0, 4), { kind: "vcvs", inputs: 2, expression: "(a-b)*10 + a^2" }],
      ["RL", "resistor", [3, 0], { resistance: 1000 }],
    ]);
    run(e, 1e-5);
    expect(v(e)[3]).toBeCloseTo(12.25, 6);
  });

  test("VCCS wired across itself acts as the resistor its formula describes", () => {
    // -(a-b)/1000 out of "+": a 1 kΩ load between a (= +) and b (= -).
    const e = engine(10, [
      ["V1", "battery", [1, 0], { voltage: 5 }],
      ["R1", "resistor", [1, 2], { resistance: 1000 }],
      ["B1", "expression-source", pins([2, 0], 2, 0, 3), { kind: "vccs", inputs: 2, expression: "-(a-b)/1000" }],
    ]);
    run(e, 1e-5);
    expect(v(e)[2]).toBeCloseTo(2.5, 4);
  });

  test("CCVS: a transresistance from the current through its input pair", () => {
    const e = engine(10, [
      ["V1", "battery", [1, 0], { voltage: 2 }],
      ["R1", "resistor", [1, 2], { resistance: 1000 }],
      ["B1", "expression-source", pins([2, 0], 3, 0, 4), { kind: "ccvs", inputs: 2, expression: "i*500" }],
      ["RL", "resistor", [3, 0], { resistance: 1000 }],
    ]);
    run(e, 1e-5);
    expect(v(e)[3]).toBeCloseTo(1, 4); // 2 mA × 500 Ω
  });
});
