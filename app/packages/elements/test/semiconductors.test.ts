import type { ElementModel, Stamper } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import type { PropValue } from "@cs/model";
import { currentsOf, dcStep, DenseStamper, readoutsOf, tran, view } from "./harness";

function model(type: string, nodes: number[], props: Record<string, PropValue> = {}, firstBranch = 10): ElementModel {
  const m = getModelFactory(type)!({ id: "x", type, nodes, props });
  let next = firstBranch;
  m.setup({ nodes, allocBranch: () => next++ });
  return m;
}

/** Records every Stamper call. */
class RecordingStamper implements Stamper {
  calls: [string, ...number[]][] = [];
  matrix(r: number, c: number, v: number) { this.calls.push(["matrix", r, c, v]); }
  rhs(r: number, v: number) { this.calls.push(["rhs", r, v]); }
  conductance(a: number, b: number, g: number) { this.calls.push(["conductance", a, b, g]); }
  current(a: number, b: number, i: number) { this.calls.push(["current", a, b, i]); }
  voltageSource(br: number, p: number, m: number, v: number) { this.calls.push(["voltageSource", br, p, m, v]); }
}

const near = (a: number, b: number, abs: number, rel = 1e-6) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(abs + rel * Math.max(Math.abs(a), Math.abs(b)));

/**
 * At an accepted point the Newton stamp must reproduce the model's own
 * terminal currents (row k: Σ A[k][j]·V_j - b[k] = current into terminal k)
 * and its matrix entries must be the finite-difference Jacobian.
 */
function checkStamp(type: string, terminalVolts: number[], props: Record<string, PropValue> = {}) {
  const n = terminalVolts.length;
  const nodes = terminalVolts.map((_, i) => i + 1);
  const m = model(type, nodes, props);
  const x = [0, ...terminalVolts];
  m.accept(view(x), dcStep);
  const s = new DenseStamper(n + 1);
  m.stampNewton!(s, view(x), dcStep);
  const cur = currentsOf(m, x, n);
  const scale = Math.max(1e-9, ...cur.map(Math.abs));
  for (let k = 0; k < n; k++) {
    const lin = nodes.reduce((acc, j) => acc + s.A[k + 1][j] * x[j], 0) - s.b[k + 1];
    near(lin, cur[k], 1e-9 * scale + 1e-15);
  }
  for (let j = 0; j < n; j++) {
    const h = 1e-6;
    const xp = [...x];
    const xm = [...x];
    xp[j + 1] += h;
    xm[j + 1] -= h;
    const cp = currentsOf(m, xp, n);
    const cm = currentsOf(m, xm, n);
    for (let k = 0; k < n; k++) near(s.A[k + 1][j + 1], (cp[k] - cm[k]) / (2 * h), 1e-9, 1e-4);
  }
  return { m, x, cur };
}

describe("BJT stamps", () => {
  const bias: [string, number[]][] = [
    ["active", [0.65, 5, 0]],
    ["saturated", [0.75, 0.1, 0]],
    ["cut-off", [0, 5, 0]],
    ["reverse active", [0.65, 0, 5]],
  ];
  for (const [name, v] of bias) {
    it(`NPN ${name}: Newton stamp matches currents and Jacobian`, () => {
      const { cur } = checkStamp("npn-transistor", v);
      near(cur[0] + cur[1] + cur[2], 0, 1e-15);
    });
    it(`PNP ${name} (mirrored): Newton stamp matches currents and Jacobian`, () => {
      const { cur } = checkStamp("pnp-transistor", v.map((u) => -u));
      near(cur[0] + cur[1] + cur[2], 0, 1e-15);
    });
  }

  it("reports beta as Ic/Ib in the active region and mirrors for PNP", () => {
    const npn = checkStamp("npn-transistor", [0.65, 5, 0], { beta: 150 });
    const r = readoutsOf(npn.m, npn.x);
    expect(r.region).toBe(1);
    near(r.gain, 150, 0, 1e-3);
    const pnp = checkStamp("pnp-transistor", [-0.65, -5, 0], { beta: 150 });
    near(currentsOf(pnp.m, pnp.x, 3)[1], -npn.cur[1], 0, 1e-12);
    expect(readoutsOf(pnp.m, pnp.x).region).toBe(1);
  });

  it("limits a huge Newton jump of the junction voltage", () => {
    const m = model("npn-transistor", [1, 2, 3]);
    m.accept(view([0, 0.6, 5, 0]), dcStep);
    const s = new RecordingStamper();
    m.stampNewton!(s, view([0, 20, 5, 0]), dcStep);
    // Converged must be false: the stamp was made at a limited vbe, not at 20 V.
    expect(m.hasConverged!(view([0, 20, 5, 0]), view([0, 0.6, 5, 0]))).toBe(false);
    for (const c of s.calls) for (const v of c.slice(1)) expect(Number.isFinite(v as number)).toBe(true);
  });
});

describe("MOSFET stamps", () => {
  const bias: [string, number[]][] = [
    ["saturation", [3, 5, 0]],
    ["linear", [5, 0.5, 0]],
    ["cut-off", [1, 5, 0]],
    ["reversed (drain below source)", [5, 0, 0.5]],
  ];
  for (const [name, v] of bias) {
    it(`N-channel ${name}: Newton stamp matches currents and Jacobian`, () => {
      checkStamp("n-mosfet", v, { lambda: 0.02 });
    });
    it(`P-channel ${name} (mirrored): Newton stamp matches currents and Jacobian`, () => {
      checkStamp("p-mosfet", v.map((u) => -u), { lambda: 0.02 });
    });
  }

  it("follows the square law in saturation", () => {
    const { m, x, cur } = checkStamp("n-mosfet", [3, 5, 0], { threshold: 1, beta: 0.002 });
    near(cur[1], 0.5 * 0.002 * 4, 1e-12);
    expect(readoutsOf(m, x).region).toBe(2);
    expect(cur[0]).toBe(0);
  });
});

describe("zener stamps", () => {
  for (const v of [0.6, 0, -3, -5.6, -5.8]) {
    it(`at ${v} V: Newton stamp matches current and conductance`, () => {
      checkStamp("zener-diode", [v, 0]);
    });
  }

  it("conducts 5 mA at the zener voltage and nothing at 0 V", () => {
    const m = model("zener-diode", [1, 0], { zenerVoltage: 4.7 });
    near(currentsOf(m, [0, -4.7], 2)[0], -0.005, 1e-9, 1e-6);
    near(currentsOf(m, [0, 0], 2)[0], 0, 1e-20);
  });
});

describe("op-amp stamp", () => {
  it("stamps an output source to ground with -slope on V+ and +slope on V-", () => {
    const m = model("op-amp", [1, 2, 3], { gain: 1000, maxOutput: 10, minOutput: -10 }, 7);
    const s = new RecordingStamper();
    m.stampNewton!(s, view([0, 0, 0, 0]), dcStep);
    expect(s.calls).toEqual([
      ["voltageSource", 7, 3, 0, 0],
      ["matrix", 7, 2, -1000],
      ["matrix", 7, 1, 1000],
    ]);
  });

  it("solves a unity-gain follower and reports saturation at the rail", () => {
    // Follower: input at node 1 (+), output tied to "-" at node 2.
    const m = model("op-amp", [2, 1, 2], {}, 3);
    let x = [0, 0, 0, 0, 0];
    for (let it = 0; it < 5; it++) x = solveWith(m, x, 2);
    near(x[2], 2, 1e-4);
    expect(m.hasConverged!(view(x), view(x))).toBe(true);
    const sat = model("op-amp", [1, 2, 3], {}, 4);
    expect(readoutsOf(sat, [0, 0, 1, 15, 0]).saturated).toBe(1);
  });
});

/** One Newton step for an op-amp follower driven by an ideal source at node 1. */
function solveWith(m: ElementModel, x: number[], vin: number): number[] {
  const s = new DenseStamper(5);
  s.voltageSource(4, 1, 0, vin);
  m.stampNewton!(s, view(x), dcStep);
  return s.solve();
}

describe("controlled source stamps", () => {
  it("VCVS: V(O) - gain·V(C) = 0 on its branch", () => {
    const s = new RecordingStamper();
    model("vcvs", [1, 2, 3, 4], { gain: 5 }, 9).stampStatic!(s);
    expect(s.calls).toEqual([
      ["voltageSource", 9, 3, 4, 0],
      ["matrix", 9, 1, -5],
      ["matrix", 9, 2, 5],
    ]);
  });

  it("VCCS: transconductance block from control to output rows", () => {
    const s = new RecordingStamper();
    model("vccs", [1, 2, 3, 4], { gain: 0.5 }).stampStatic!(s);
    expect(s.calls).toEqual([
      ["matrix", 3, 1, 0.5],
      ["matrix", 3, 2, -0.5],
      ["matrix", 4, 1, -0.5],
      ["matrix", 4, 2, 0.5],
    ]);
  });

  it("CCVS and CCCS sense through a zero-volt control branch", () => {
    const h = new RecordingStamper();
    model("ccvs", [1, 2, 3, 4], { gain: 100 }, 9).stampStatic!(h);
    expect(h.calls).toEqual([
      ["voltageSource", 9, 1, 2, 0],
      ["voltageSource", 10, 3, 4, 0],
      ["matrix", 10, 9, -100],
    ]);
    const f = new RecordingStamper();
    model("cccs", [1, 2, 3, 4], { gain: 3 }, 9).stampStatic!(f);
    expect(f.calls).toEqual([
      ["voltageSource", 9, 1, 2, 0],
      ["matrix", 3, 9, 3],
      ["matrix", 4, 9, -3],
    ]);
  });
});

describe("transformer stamps", () => {
  it("is a short across each winding at DC", () => {
    const s = new RecordingStamper();
    model("transformer", [1, 2, 3, 4], {}, 9).stampStep!(s, dcStep);
    expect(s.calls).toEqual([
      ["voltageSource", 9, 1, 2, -0],
      ["voltageSource", 10, 3, 4, -0],
    ]);
  });

  it("BE companion: r = L/dt self terms and M/dt mutual terms", () => {
    const m = model("transformer", [1, 2, 3, 4], { inductance: 2, ratio: 3, coupling: 1 }, 9);
    m.loadState(Float64Array.from([0.1, 0.2, 0, 0]));
    const s = new RecordingStamper();
    m.stampStep!(s, tran(1e-3, 1e-3, "be"));
    const r11 = 2 / 1e-3;
    const r22 = 18 / 1e-3;
    const r12 = 6 / 1e-3; // M = √(L1·L2)
    const get = (r: number, c: number) => s.calls.find((k) => k[0] === "matrix" && k[1] === r && k[2] === c)![3];
    near(get(9, 9), -r11, 1e-9);
    near(get(9, 10), -r12, 1e-9);
    near(get(10, 9), -r12, 1e-9);
    near(get(10, 10), -r22, 1e-9);
    const src = s.calls.filter((k) => k[0] === "voltageSource");
    near(src[0][4], -r11 * 0.1 - r12 * 0.2, 1e-9);
    near(src[1][4], -r12 * 0.1 - r22 * 0.2, 1e-9);
  });

  it("reversed polarity negates the mutual inductance", () => {
    const m = model("transformer", [1, 2, 3, 4], { inductance: 1, coupling: 0.5, reversePolarity: true }, 9);
    const s = new RecordingStamper();
    m.stampStep!(s, tran(1e-3, 1e-3, "be"));
    expect(s.calls.find((k) => k[0] === "matrix" && k[1] === 9 && k[2] === 10)![3]).toBeCloseTo(500, 9);
  });
});
