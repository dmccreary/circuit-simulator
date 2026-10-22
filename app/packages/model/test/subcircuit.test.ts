import { createPartResolver } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { operatingPoint } from "@cs/engine";
import {
  compile,
  createDocument,
  decodeLayout,
  instancesOf,
  makeSubcircuit,
  produce,
  separateInstance,
  syncInstances,
  type CircuitDocument,
  type CompiledCircuit,
  type Part,
  type PropValue,
  type Rotation,
} from "@cs/model";

const resolver = createPartResolver();
let n = 0;
const newId = (p: string) => `${p}_${++n}`;

function part(id: string, type: string, x: number, y: number, rot: Rotation, props: Record<string, PropValue>, length?: number): Part {
  return { id, type, label: id.toUpperCase(), at: { x, y }, orientation: { rot, flip: false }, props, ...(length ? { length } : {}) };
}
const w = (id: string, ...pts: [number, number][]) => ({ id, points: pts.map(([x, y]) => ({ x, y })) });

/** 10 V into R1 then R2 to ground, and R3 + R4 in series across R2. */
function ladder(): CircuitDocument {
  const parts = [
    part("v1", "battery", 0, 4, 90, { voltage: 10, internalResistance: 0 }, 4),
    part("r1", "resistor", 2, 0, 0, { resistance: 1000 }, 4),
    part("r2", "resistor", 8, 2, 90, { resistance: 2000 }, 4),
    part("r3", "resistor", 10, 0, 0, { resistance: 3000 }, 4),
    part("r4", "resistor", 16, 2, 90, { resistance: 4000 }, 4),
    part("g1", "ground", 0, 10, 0, {}),
  ];
  const wires = [
    w("w1", [0, 4], [0, 0], [2, 0]),
    w("w2", [6, 0], [8, 0], [8, 2]),
    w("w3", [8, 0], [10, 0]),
    w("w4", [14, 0], [16, 0], [16, 2]),
    w("w5", [16, 6], [16, 10], [0, 10]),
    w("w6", [8, 6], [8, 10]),
    w("w7", [0, 8], [0, 10]),
  ];
  return createDocument({
    parts: Object.fromEntries(parts.map((p) => [p.id, p])),
    wires: Object.fromEntries(wires.map((x) => [x.id, x])),
    probes: {
      pr: {
        id: "pr",
        name: "V(R4)",
        quantity: "voltage",
        target: { kind: "across", part: "r4" },
        style: { color: "probe.1", width: 1 },
        lane: "L1",
        flag: { offset: { x: 0, y: 0 }, showValue: false },
        measurements: [],
      },
    },
  });
}

/** Node voltage at every terminal of every element, keyed "id:terminal". */
function solve(c: CompiledCircuit): Map<string, number> {
  const op = operatingPoint(c.netlist, getModelFactory);
  expect(op.x).not.toBeNull();
  const out = new Map<string, number>();
  for (const el of c.netlist.elements) el.nodes.forEach((nd, i) => out.set(`${el.id.split("/").pop()}:${i}`, op.x![nd]));
  return out;
}

const make = (doc: CircuitDocument, ids: string[]) => {
  let result: ReturnType<typeof makeSubcircuit> | undefined;
  const next = produce(doc, (d) => {
    result = makeSubcircuit(d, ids, { resolver, newId, name: "Pair", label: "U1" });
  }).doc;
  if (!result?.ok) throw new Error("make failed");
  return { doc: next, r: result };
};

describe("make subcircuit from selection (EDT-34)", () => {
  test("pins come from the nets crossing the boundary and the circuit is unchanged", () => {
    const before = ladder();
    const cb = compile(before, resolver);
    expect(cb.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const { doc, r } = make(before, ["r3", "r4", "w4"]);

    expect(r.pins).toHaveLength(2);
    const def = doc.subcircuits[r.definition];
    expect(Object.keys(def.parts).sort()).toEqual(["r3", "r4"]);
    expect(Object.keys(def.wires)).toEqual(["w4"]);
    expect(doc.parts.r3).toBeUndefined();
    const inst = doc.parts[r.instance];
    expect(decodeLayout(inst.props.pinLayout).pins.map((p) => p.name)).toEqual(r.pins.map((p) => p.name));

    const ca = compile(doc, resolver);
    expect(ca.diagnostics.filter((d) => d.id === "unknown-part")).toEqual([]);
    expect(ca.netlist.elements.map((e) => e.id)).toContain(`${r.instance}/r3`);
    const vb = solve(cb);
    const va = solve(ca);
    expect(va.size).toBe(vb.size);
    for (const [k, v] of vb) expect(va.get(k), k).toBeCloseTo(v, 9);
    // The probe now names its part through the instance and still resolves.
    expect(doc.probes.pr.target).toEqual({ kind: "across", part: `${r.instance}/r4` });
    expect(ca.channels.pr).toBeDefined();
  });

  test("selecting a whole branch with its ground keeps the circuit unchanged", () => {
    const before = ladder();
    const { doc } = make(before, ["r1", "r2", "w2", "w6"]);
    const vb = solve(compile(before, resolver));
    const va = solve(compile(doc, resolver));
    for (const [k, v] of vb) expect(va.get(k), k).toBeCloseTo(v, 9);
  });

  test("an empty selection is refused", () => {
    const d = ladder();
    produce(d, (x) => expect(makeSubcircuit(x, ["w1"], { resolver, newId, name: "x", label: "U1" })).toEqual({ ok: false, reason: "empty" }));
  });

  test("probes inside an instance resolve wire segments through the path", () => {
    const { doc, r } = make(ladder(), ["r3", "r4", "w4"]);
    const withProbe = produce(doc, (d) => {
      d.probes.in = { ...d.probes.pr, id: "in", target: { kind: "point", wire: `${r.instance}/w4`, segment: 1, t: 0.5 } };
    }).doc;
    const c = compile(withProbe, resolver);
    const ch = c.channels.in;
    expect(ch?.kind).toBe("voltage");
    const r4 = c.netlist.elements.find((e) => e.id === `${r.instance}/r4`)!;
    expect(ch && ch.kind === "voltage" && ch.a).toBe(r4.nodes[0]);
  });
});

describe("edit one copy or all (EDT-38)", () => {
  test("'this one' copies the definition and repoints only that instance", () => {
    const { doc, r } = make(ladder(), ["r3", "r4", "w4"]);
    const src = structuredClone(doc.parts[r.instance]);
    const two = produce(doc, (d) => {
      d.parts.u2 = { ...src, id: "u2", label: "U2", at: { x: 30, y: 0 } };
    }).doc;
    expect(instancesOf(two, r.definition)).toHaveLength(2);
    let copy: string | undefined;
    const sep = produce(two, (d) => {
      copy = separateInstance(d, null, "u2", newId);
      d.subcircuits[copy!].parts.r3.props.resistance = 1;
      d.subcircuits[copy!].pins[0].name = "renamed";
      syncInstances(d, copy!);
    }).doc;
    expect(sep.parts.u2.props.definition).toBe(copy);
    expect(sep.parts[r.instance].props.definition).toBe(r.definition);
    expect(sep.subcircuits[r.definition].parts.r3.props.resistance).toBe(3000);
    expect(decodeLayout(sep.parts.u2.props.pinLayout).pins[0].name).toBe("renamed");
    expect(decodeLayout(sep.parts[r.instance].props.pinLayout).pins[0].name).not.toBe("renamed");
  });
});
