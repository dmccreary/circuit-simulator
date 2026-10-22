// Options added so Falstad element variants import exactly: JK flip-flops
// triggered on the falling clock edge, active-low D flip-flop set/reset, and
// gates with 1 or 5..8 inputs (xor gates of any width are parity checks).
import { createEngine, type Engine } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import type { Netlist, PropValue } from "@cs/model";

type El = [string, string, number[], Record<string, PropValue>];
const settings = { realisticParts: false, realisticRatings: false, start: "zero" as const, seed: 1 };

function engine(nodeCount: number, els: El[], watch: number[]): Engine {
  const net: Netlist = {
    nodeCount,
    nodeNames: ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)],
    elements: els.map(([id, type, nodes, props]) => ({ id, type, nodes, props })),
    settings,
  };
  const e = createEngine(net, getModelFactory);
  e.setChannels(watch.map((node, i) => ({ id: `c${i}`, kind: "logic" as const, node })));
  return e;
}

/** Times and values of channel 0 changes up to `until`. */
function edges(e: Engine, until: number): { t: number; v: number }[] {
  while (e.time < until) if (!e.step().ok) throw new Error(JSON.stringify(e.diagnostics));
  const b = e.drainSamples();
  const out: { t: number; v: number }[] = [];
  for (let i = 1; i < b.times.length; i++) if (b.samples[i] !== b.samples[i - 1]) out.push({ t: b.times[i], v: b.samples[i] });
  return out;
}

const level = (e: Engine, until: number): number => {
  while (e.time < until) if (!e.step().ok) throw new Error(JSON.stringify(e.diagnostics));
  const b = e.drainSamples();
  return b.samples[b.times.length - 1];
};

describe("JK flip-flop clock edge", () => {
  const toggle = (fallingEdge: boolean) =>
    engine(
      4,
      [
        ["CLK", "clock", [1], { frequency: 1e3 }],
        ["H", "logic-input", [2], { high: true }],
        ["U1", "jk-flip-flop", [2, 1, 2, 3, 4], { fallingEdge }],
      ],
      [3, 1],
    );

  test("falling-edge toggling lags rising-edge toggling by half a clock period", () => {
    const rising = edges(toggle(false), 4.2e-3);
    const falling = edges(toggle(true), 4.2e-3);
    expect(rising.length).toBeGreaterThanOrEqual(3);
    expect(falling.length).toBeGreaterThanOrEqual(3);
    for (let k = 0; k < 3; k++) expect(Math.abs(falling[k].t - rising[k].t)).toBeCloseTo(0.5e-3, 6);
  });
});

describe("D flip-flop set/reset polarity", () => {
  const dff = (invertSetReset: boolean, resetHigh: boolean) =>
    engine(
      6,
      [
        ["CLK", "clock", [1], { frequency: 1e3 }],
        ["D", "logic-input", [2], { high: true }],
        ["R", "logic-input", [5], { high: resetHigh }],
        ["U1", "d-flip-flop", [2, 1, 3, 4, 6, 5], { invertSetReset }],
      ],
      [3],
    );

  test("active-high reset: a low R lets D through, a high R holds Q low", () => {
    expect(level(dff(false, false), 3e-3)).toBe(1);
    expect(level(dff(false, true), 3e-3)).toBe(0);
  });

  test("invertSetReset: a low R holds Q low, a high R lets D through", () => {
    expect(level(dff(true, false), 3e-3)).toBe(0);
    expect(level(dff(true, true), 3e-3)).toBe(1);
  });
});

describe("gates with other input counts", () => {
  const gate = (type: string, ins: boolean[]) =>
    engine(
      ins.length + 1,
      [
        ...ins.map((high, i): El => [`I${i}`, "logic-input", [i + 1], { high }]),
        ["U1", type, [...ins.map((_, i) => i + 1), ins.length + 1], {}],
      ],
      [ins.length + 1],
    );

  test.each([
    ["xor-gate-7", [true, true, false, true, false, false, false], 1],
    ["xor-gate-7", [true, true, false, true, false, false, true], 0],
    ["xor-gate-3", [true, true, false], 0],
    ["and-gate-6", [true, true, true, true, true, true], 1],
    ["and-gate-6", [true, true, true, false, true, true], 0],
    ["nand-gate-5", [true, true, true, true, true], 0],
    ["and-gate-1", [true], 1],
    ["nand-gate-1", [true], 0],
  ])("%s %j -> %d", (type, ins, out) => {
    expect(level(gate(type, ins), 1e-4)).toBe(out);
  });
});
