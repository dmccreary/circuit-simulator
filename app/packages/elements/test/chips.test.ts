// Behaviour of the chip families (CircuitJS1 ChipElm subclasses): digital
// chips driven through a fake DigitalContext, converters and the LED array
// through the real engine.
import { createEngine, type Engine } from "@cs/engine";
import { getDescriptor } from "@cs/elements";
import type { DigitalContext } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import type { Netlist, NetlistElement, PropValue } from "@cs/model";
import { displayText } from "../src/instruction-display/view";
import { parseRules } from "../src/custom-logic/model";

type Logic = "0" | "1" | "X" | "Z";

/** A chip with a pin -> level map for inputs; returns the outputs it drives. */
function chip(type: string, props: Record<string, PropValue> = {}, savedState?: number[]) {
  const n = getDescriptor(type)!.terminals.length;
  const el: NetlistElement = { id: "U1", type, nodes: Array.from({ length: n }, (_, i) => i + 1), props };
  if (savedState) el.savedState = savedState;
  const m = getModelFactory(type)!(el);
  const pins: Logic[] = new Array<Logic>(n).fill("0");
  const out: Logic[] = new Array<Logic>(n).fill("X");
  const ctx: DigitalContext = {
    t: 0,
    input: (p) => pins[p],
    schedule: (p, v) => (out[p] = v),
  };
  const eval_ = (set: Record<number, Logic | 0 | 1> = {}) => {
    for (const [p, v] of Object.entries(set)) pins[Number(p)] = v === 1 ? "1" : v === 0 ? "0" : v;
    m.evaluateDigital!(ctx);
    return out;
  };
  /** Outputs on pins [first, first+count) as a number, `first` the most significant when msbFirst. */
  const word = (first: number, count: number, msbFirst = false) =>
    Array.from({ length: count }, (_, i) => (out[first + i] === "1" ? 1 << (msbFirst ? count - 1 - i : i) : 0)).reduce((a, b) => a + b, 0);
  return { eval: eval_, word, out };
}

describe("counters", () => {
  test("CounterElm counts rising edges and clears while R is active", () => {
    const c = chip("counter-4", { invertReset: false });
    c.eval({ 0: 0 });
    for (let k = 0; k < 5; k++) {
      c.eval({ 0: 1 });
      c.eval({ 0: 0 });
    }
    expect(c.word(2, 4, true)).toBe(5);
    c.eval({ 1: 1 });
    expect(c.word(2, 4, true)).toBe(0);
  });

  test("CounterElm modulus and the saved count", () => {
    const c = chip("counter-3", { modulus: 3, invertReset: true }, [0, 0, 0, 0, 1, 0]); // Q = 010
    c.eval({ 1: 1 });
    expect(c.word(2, 3, true)).toBe(2);
    c.eval({ 0: 1 });
    expect(c.word(2, 3, true)).toBe(0); // 3 mod 3
  });

  test("Counter2Elm counts with EnP and EnT, loads while LOAD is low, raises RCO at 15", () => {
    const c = chip("sync-counter-4");
    // pins: Q 0-3, I 4-7, CLK 8, CLR 9, EnP 10, RCO 11, LOAD 12, EnT 13
    c.eval({ 9: 1, 10: 1, 12: 1, 13: 1, 4: 1, 5: 1, 6: 1, 7: 0 });
    for (let k = 0; k < 3; k++) {
      c.eval({ 8: 1 });
      c.eval({ 8: 0 });
    }
    expect(c.word(0, 4, true)).toBe(3);
    c.eval({ 12: 0 });
    c.eval({ 8: 1 });
    expect(c.word(0, 4, true)).toBe(14); // loaded 1110
    c.eval({ 8: 0, 12: 1 });
    c.eval({ 8: 1 });
    expect(c.word(0, 4, true)).toBe(15);
    expect(c.out[11]).toBe("1");
    c.eval({ 9: 0 });
    expect(c.word(0, 4, true)).toBe(0);
  });

  test("RingCounterElm moves one high output along on each clock", () => {
    const c = chip("ring-counter-4", { invertReset: true });
    c.eval({ 1: 1 }); // R inactive (high)
    expect(c.out.slice(2, 6)).toEqual(["1", "0", "0", "0"]);
    c.eval({ 0: 1 });
    c.eval({ 0: 0 });
    c.eval({ 0: 1 });
    expect(c.out.slice(2, 6)).toEqual(["0", "0", "1", "0"]);
    c.eval({ 1: 0 });
    expect(c.out.slice(2, 6)).toEqual(["1", "0", "0", "0"]);
  });
});

describe("combinational chips", () => {
  test("multiplexer selects I[S]", () => {
    const c = chip("multiplexer-2"); // I0-3, S0 4, S1 5, Q 6
    expect(c.eval({ 2: 1, 4: 0, 5: 1 })[6]).toBe("1");
    expect(c.eval({ 4: 1 })[6]).toBe("0");
  });

  test("bus multiplexer copies a whole input bus", () => {
    const c = chip("multiplexer-2-bus4"); // I0 0-3 ... I3 12-15, S 16-17, Q 18-21
    c.eval({ 8: 1, 10: 1, 16: 0, 17: 1 });
    expect(c.word(18, 4)).toBe(0b0101);
  });

  test("demultiplexer routes the input to Q[S], the rest idle", () => {
    const c = chip("demultiplexer-2", { idleHigh: true }); // Q0-3, S0 4, S1 5, in 6
    expect(c.eval({ 4: 1, 6: 0 }).slice(0, 4)).toEqual(["1", "0", "1", "1"]);
  });

  test("4-bit adder", () => {
    const c = chip("full-adder-4"); // A 0-3, B 4-7, S 8-11, Cin 12, C 13
    const set: Record<number, 0 | 1> = { 12: 1 };
    for (let i = 0; i < 4; i++) {
      set[i] = ((9 >> i) & 1) as 0 | 1;
      set[4 + i] = ((8 >> i) & 1) as 0 | 1;
    }
    c.eval(set);
    expect(c.word(8, 4)).toBe((9 + 8 + 1) & 15);
    expect(c.out[13]).toBe("1");
  });

  test("seven-segment decoder", () => {
    const c = chip("seven-seg-decoder-bi"); // a-g 0-6, I3..I0 7-10, BI 11
    expect(c.eval({ 7: 0, 8: 0, 9: 1, 10: 0, 11: 1 }).slice(0, 7).join("")).toBe("1101101"); // 2
    expect(c.eval({ 11: 0 }).slice(0, 7).join("")).toBe("0000000");
  });

  test("ROM reads its contents and floats while OE̅ is high", () => {
    const c = chip("rom-4x4", { contents: "0: 1 2 3\n8: 0xF" }); // OE 0, A3..A0 1-4, D3..D0 5-8
    c.eval({ 3: 1 });
    expect(c.word(5, 4, true)).toBe(3);
    c.eval({ 1: 1, 3: 0 });
    expect(c.word(5, 4, true)).toBe(15);
    expect(c.eval({ 0: 1 })[5]).toBe("Z");
  });

  test("custom logic follows its truth table, with edges and pattern letters", () => {
    const rules = "0a=a0\n1a=0A\n";
    expect(parseRules(rules, 2, 2)).toEqual([
      { left: "0a", right: "a0" },
      { left: "1a", right: "0a" },
    ]);
    const c = chip("custom-logic-2x2", { rules: "00=10\n01=01\n1?=11" });
    expect(c.eval({ 0: 0, 1: 1 }).slice(2)).toEqual(["0", "1"]);
    expect(c.eval({ 0: 1 }).slice(2)).toEqual(["1", "1"]);
    const t = chip("custom-logic-1x1", { rules: "+=1\n-=0" });
    t.eval({ 0: 0 });
    expect(t.eval({ 0: 1 })[1]).toBe("1");
  });
});

describe("storage chips", () => {
  test("T flip-flop toggles on rising clocks while T is high; R clears", () => {
    const c = chip("t-flip-flop-r"); // T 0, Q 1, Q̄ 2, CLK 3, R 4
    c.eval({ 0: 1 });
    expect(c.out.slice(1, 3)).toEqual(["0", "1"]);
    c.eval({ 3: 1 });
    expect(c.out.slice(1, 3)).toEqual(["1", "0"]);
    c.eval({ 3: 0 });
    c.eval({ 3: 1 });
    expect(c.out[1]).toBe("0");
    c.eval({ 3: 0, 0: 1 });
    c.eval({ 3: 1 });
    c.eval({ 4: 1 });
    expect(c.out[1]).toBe("0");
  });

  test("latch loads on Ld's rising edge, or while high when transparent", () => {
    const c = chip("latch-4"); // I 0-3, O 4-7, Ld 8
    c.eval({ 0: 1, 2: 1 });
    expect(c.word(4, 4)).toBe(0);
    c.eval({ 8: 1 });
    expect(c.word(4, 4)).toBe(0b0101);
    c.eval({ 1: 1 });
    expect(c.word(4, 4)).toBe(0b0101);
    const t = chip("latch-4", { edgeTriggered: false });
    t.eval({ 8: 1, 3: 1 });
    t.eval({ 0: 1 });
    expect(t.word(4, 4)).toBe(0b1001);
  });

  test("bus input drives its value", () => {
    const c = chip("bus-input-4", { value: 6 });
    expect(c.eval().join("")).toBe("0110");
  });
});

// ---------------------------------------------------------------- through the engine

const settings = { realisticParts: false, realisticRatings: false, start: "zero" as const, seed: 1 };
function engine(nodeCount: number, els: [string, string, number[], Record<string, PropValue>][]): Engine {
  const elements: NetlistElement[] = els.map(([id, type, nodes, props]) => ({ id, type, nodes, props }));
  const net: Netlist = { nodeCount, nodeNames: ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)], elements, settings };
  const e = createEngine(net, getModelFactory);
  expect(e.status).toBe("ok");
  return e;
}
const dc = (voltage: number): Record<string, PropValue> => ({ waveform: "dc", voltage });
const step = (e: Engine, n = 3) => {
  for (let k = 0; k < n; k++) expect(e.step().ok).toBe(true);
};

describe("converters", () => {
  test("DAC: V(O) = code / 15 · V(V+)", () => {
    // D0..D3 on nodes 1-4 (D0 = 1, D2 = 1 -> code 5), O node 5, V+ node 6.
    const e = engine(6, [
      ["H", "logic-input", [1], { high: true }],
      ["L", "logic-input", [2], { high: false }],
      ["H2", "logic-input", [3], { high: true }],
      ["L2", "logic-input", [4], { high: false }],
      ["U", "dac-4", [1, 2, 3, 4, 5, 6], {}],
      ["V", "rail", [6], dc(3)],
      ["R", "resistor", [5, 0], { resistance: 1000 }],
    ]);
    step(e);
    expect(e.displayState()[5]).toBeCloseTo((5 / 15) * 3, 6);
  });

  test("ADC: code = floor(15 · V(In) / V(V+)) on D0..D3", () => {
    const e = engine(6, [
      ["U", "adc-4", [1, 2, 3, 4, 5, 6], {}],
      ["Vin", "rail", [5], dc(2)],
      ["Vr", "rail", [6], dc(5)],
    ]);
    step(e, 4);
    expect(e.readouts("U").code).toBe(6);
    const v = e.displayState();
    expect([1, 2, 3, 4].map((k) => (v[k] > 2.5 ? 1 : 0))).toEqual([0, 1, 1, 0]);
  });
});

describe("LED array", () => {
  test("lights the LED where a driven row meets a grounded column", () => {
    // 5 x 7: columns nodes 1-5, rows 6-12. Row 0 at 5 V through 330 Ω, column 2 grounded.
    const nodes = Array.from({ length: 12 }, (_, i) => i + 1);
    const e = engine(13, [
      ["V", "rail", [13], dc(5)],
      ["R", "resistor", [13, 6], { resistance: 330 }],
      ["G", "resistor", [3, 0], { resistance: 1 }],
      ["D", "led-array-5x7", nodes, {}],
    ]);
    step(e);
    const r = e.readouts("D");
    expect(r.b2).toBeGreaterThan(0.5);
    expect(r.b0 ?? 0).toBeLessThan(0.01);
  });
});

describe("instruction display", () => {
  test("looks up ranges and evaluates {expressions}", () => {
    const table = "0-0xF=ADD A, {a}\n0x30-0x3F=MOV A,{a & 15}\n0b1000000=JMP";
    expect(displayText(table, 3)).toBe("ADD A, 3");
    expect(displayText(table, 0x35)).toBe("MOV A,5");
    expect(displayText(table, 64)).toBe("JMP");
    expect(displayText(table, 99)).toBe("99");
  });
});
