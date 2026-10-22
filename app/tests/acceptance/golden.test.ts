// Determinism golden file (PRN-09, SIM-23; design §7.4): ten representative
// circuits, analog and mixed digital, run for a fixed simulated time. The
// full sample stream of each (every step's time and every channel's value,
// as IEEE-754 bits) is hashed and compared with golden.json. Any change to
// a single bit of any sample fails the test.
//
// After an intended change to the engine or a model, regenerate with
//   UPDATE_GOLDEN=1 npx vitest run tests/acceptance/golden.test.ts
// and review the diff of golden.json in the commit.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createEngine } from "@cs/engine";
import { createPartResolver } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { importFalstad } from "@cs/formats";
import { compile, type ChannelSpec, type Netlist } from "@cs/model";
import { CAP_TXT } from "../../packages/formats/test/fixtures";
import { netlist, type El } from "../helpers/circuit";

const GOLDEN = fileURLToPath(new URL("./golden.json", import.meta.url));
const UPDATE = process.env.UPDATE_GOLDEN === "1";

interface Case {
  netlist: Netlist;
  channels: ChannelSpec[];
  /** Simulated seconds. */
  until: number;
  /** Switch closed / input toggled at t = 0 (a scheduled change). */
  atStart?: { element: string; param: string; value: number | boolean };
}

const v = (id: string, a: number, b = 0): ChannelSpec => ({ id, kind: "voltage", a, b });
const i = (id: string, element: string): ChannelSpec => ({ id, kind: "current", element, terminal: 0 });
const logic = (id: string, node: number): ChannelSpec => ({ id, kind: "logic", node });

const ff = (k: number): El => {
  const clk = k === 0 ? 1 : 3 + 2 * (k - 1);
  return [`U${k}`, "d-flip-flop", [3 + 2 * k, clk, 2 + 2 * k, 3 + 2 * k, 10 + 2 * k, 11 + 2 * k], { delay: 10e-9 }];
};

const CASES: Record<string, Case> = {
  "rc-charge": {
    netlist: netlist(3, [
      ["V1", "battery", [1, 0], { voltage: 10 }],
      ["S1", "switch", [1, 2], { closed: false }],
      ["R1", "resistor", [2, 3], { resistance: 10e3 }],
      ["C1", "capacitor", [3, 0], { capacitance: 100e-6 }],
    ]),
    atStart: { element: "S1", param: "closed", value: true },
    channels: [v("vc", 3), i("ir", "R1")],
    until: 3,
  },
  "rlc-step": {
    netlist: netlist(4, [
      ["V1", "battery", [1, 0], { voltage: 10 }],
      ["S1", "switch", [1, 2], { closed: false }],
      ["R1", "resistor", [2, 3], { resistance: 20 }],
      ["L1", "inductor", [3, 4], { inductance: 10e-3 }],
      ["C1", "capacitor", [4, 0], { capacitance: 10e-6 }],
    ]),
    atStart: { element: "S1", param: "closed", value: true },
    channels: [v("vc", 4), i("il", "L1")],
    until: 0.02,
  },
  "lc-tank": {
    netlist: netlist(1, [
      ["C1", "capacitor", [1, 0], { capacitance: 10e-6, initialVoltage: 5 }],
      ["L1", "inductor", [1, 0], { inductance: 10e-3 }],
    ]),
    channels: [v("vc", 1), i("il", "L1")],
    until: 0.02,
  },
  "half-wave-rectifier": {
    netlist: netlist(2, [
      ["V1", "ac-source", [1, 0], { amplitude: 17, frequency: 60 }],
      ["D1", "diode", [1, 2], {}],
      ["C1", "capacitor", [2, 0], { capacitance: 1000e-6 }],
      ["R1", "resistor", [2, 0], { resistance: 100 }],
    ]),
    channels: [v("out", 2), i("id", "D1")],
    until: 0.1,
  },
  "op-amp-inverting-sine": {
    netlist: netlist(3, [
      ["V1", "ac-source", [1, 0], { amplitude: 0.5, frequency: 100 }],
      ["R1", "resistor", [1, 2], { resistance: 10e3 }],
      ["RF", "resistor", [2, 3], { resistance: 100e3 }],
      ["U1", "op-amp", [2, 0, 3], {}],
    ]),
    channels: [v("out", 3), v("vminus", 2)],
    until: 0.03,
  },
  "bjt-common-emitter": {
    netlist: netlist(7, [
      ["VCC", "battery", [1, 0], { voltage: 12 }],
      ["VIN", "ac-source", [6, 0], { amplitude: 0.01, frequency: 1000 }],
      ["CIN", "capacitor", [6, 2], { capacitance: 10e-6 }],
      ["R1", "resistor", [1, 2], { resistance: 100e3 }],
      ["R2", "resistor", [2, 0], { resistance: 20e3 }],
      ["RC", "resistor", [1, 3], { resistance: 4700 }],
      ["RE", "resistor", [4, 0], { resistance: 1000 }],
      ["CE", "capacitor", [4, 0], { capacitance: 100e-6 }],
      ["Q1", "npn-transistor", [2, 3, 4], {}],
      ["COUT", "capacitor", [3, 7], { capacitance: 10e-6 }],
      ["RL", "resistor", [7, 0], { resistance: 10e3 }],
    ]),
    channels: [v("out", 7), i("ic", "RC")],
    until: 0.01,
  },
  "timer-555-astable": {
    netlist: netlist(5, [
      ["V1", "battery", [1, 0], { voltage: 10 }],
      ["R1", "resistor", [1, 2], { resistance: 1000 }],
      ["R2", "resistor", [2, 3], { resistance: 10e3 }],
      ["C1", "capacitor", [3, 0], { capacitance: 1e-6 }],
      ["U1", "timer-555", [2, 3, 3, 1, 5, 4, 1, 0], {}],
      ["RL", "resistor", [4, 0], { resistance: 10e3 }],
    ]),
    channels: [v("vc", 3), v("out", 4)],
    until: 0.05,
  },
  "ripple-counter-4bit": {
    netlist: netlist(17, [["CLK", "clock", [1], { frequency: 1000 }], ff(0), ff(1), ff(2), ff(3)]),
    channels: [0, 1, 2, 3].map((k) => logic(`q${k}`, 2 + 2 * k)),
    until: 0.02,
  },
  "mixed-gate-rc": {
    // Clocked counter bit drives an RC through a gate; the RC feeds a Schmitt inverter back (mixed A/D/A).
    netlist: netlist(6, [
      ["CLK", "clock", [1], { frequency: 500 }],
      ["U1", "not-gate", [1, 2], { delay: 10e-9 }],
      ["R1", "resistor", [2, 3], { resistance: 1000 }],
      ["C1", "capacitor", [3, 0], { capacitance: 1e-6 }],
      ["U2", "not-gate", [3, 4], { schmitt: true, delay: 10e-9 }],
      ["U3", "and-gate", [4, 1, 5], { delay: 10e-9 }],
      ["R2", "resistor", [5, 6], { resistance: 2200 }],
      ["C2", "capacitor", [6, 0], { capacitance: 470e-9 }],
    ]),
    channels: [v("vc1", 3), logic("y2", 4), v("vc2", 6)],
    until: 0.02,
  },
  "falstad-cap.txt": (() => {
    const compiled = compile(importFalstad(CAP_TXT).doc, createPartResolver());
    const nodes = compiled.netlist.nodeCount;
    return { netlist: compiled.netlist, channels: Array.from({ length: Math.min(nodes, 4) }, (_, k) => v(`n${k + 1}`, k + 1)), until: 0.05 };
  })(),
};

/** FNV-1a, 64-bit (two 32-bit halves), over the bytes of a Float64 stream. */
class Hash64 {
  private h = 0xcbf29ce4n * (1n << 32n) + 0x84222325n;
  private readonly buf = new DataView(new ArrayBuffer(8));
  count = 0;
  addFloat(x: number): void {
    this.buf.setFloat64(0, x, true);
    for (let k = 0; k < 8; k++) {
      this.h ^= BigInt(this.buf.getUint8(k));
      this.h = (this.h * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    this.count++;
  }
  hex(): string {
    return this.h.toString(16).padStart(16, "0");
  }
}

function fingerprint(c: Case): { hash: string; steps: number; samples: number } {
  const e = createEngine(c.netlist, getModelFactory);
  e.setChannels(c.channels);
  if (c.atStart) e.setParams([c.atStart]);
  const h = new Hash64();
  let steps = 0;
  const drain = () => {
    const b = e.drainSamples();
    const n = b.times.length;
    for (let k = 0; k < n; k++) {
      h.addFloat(b.times[k]);
      for (let ch = 0; ch < c.channels.length; ch++) h.addFloat(b.samples[ch * n + k]);
    }
  };
  while (e.time < c.until) {
    const out = e.step();
    if (!out.ok) throw new Error(`step failed at t=${e.time}: ${JSON.stringify(e.diagnostics)}`);
    if (++steps % 1024 === 0) drain();
  }
  drain();
  for (const x of e.displayState()) h.addFloat(x);
  return { hash: h.hex(), steps, samples: h.count };
}

type Golden = Record<string, { hash: string; steps: number; samples: number }>;
const golden: Golden = existsSync(GOLDEN) ? (JSON.parse(readFileSync(GOLDEN, "utf8")) as Golden) : {};
const fresh: Golden = {};

describe("determinism golden file (PRN-09, SIM-23)", () => {
  test("ten representative circuits, including mixed digital", () => {
    expect(Object.keys(CASES)).toHaveLength(10);
  });

  test.each(Object.keys(CASES))("%s: two runs are bit-identical", (name) => {
    expect(fingerprint(CASES[name])).toEqual(fingerprint(CASES[name]));
  });

  test.each(Object.keys(CASES))("%s matches golden.json", (name) => {
    const fp = fingerprint(CASES[name]);
    fresh[name] = fp;
    if (UPDATE) return;
    expect(golden[name], `no golden entry for ${name}; run with UPDATE_GOLDEN=1`).toBeDefined();
    expect(fp).toEqual(golden[name]);
  });

  afterAll(() => {
    if (UPDATE && Object.keys(fresh).length === Object.keys(CASES).length) {
      writeFileSync(GOLDEN, `${JSON.stringify(fresh, null, 2)}\n`);
      console.log(`[golden] wrote ${GOLDEN}`);
    }
  });
});
