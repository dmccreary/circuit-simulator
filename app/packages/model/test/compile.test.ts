import { compile, produce, type CircuitDocument, type CompiledCircuit, type Probe, type ProbeTarget } from "@cs/model";
import { doc, part, rcLoop, resolver, wire } from "./fixtures";

const C = (d: CircuitDocument, prev?: CompiledCircuit) => compile(d, resolver, prev);
const nodeAt = (c: CompiledCircuit, x: number, y: number) => c.pointToNode.get(`${x},${y}`);
const el = (c: CompiledCircuit, id: string) => c.netlist.elements.find((e) => e.id === id)!;
const ids = (c: CompiledCircuit) => c.diagnostics.map((d) => d.id).sort();
const edit = (d: CircuitDocument, f: (d: CircuitDocument) => void) => produce(d, f).doc;

function probe(id: string, quantity: Probe["quantity"], target: ProbeTarget): Probe {
  return { id, name: id, quantity, target, style: { color: "probe.1", width: 1 }, lane: "l", flag: { offset: { x: 0, y: 0 }, showValue: false }, measurements: [] };
}

describe("series RC loop", () => {
  const c = C(rcLoop());

  test("has two nodes plus ground and the right element nodes", () => {
    expect(c.netlist.nodeCount).toBe(2);
    expect(c.netlist.nodeNames[0]).toBe("GND");
    expect(c.netlist.nodeNames.slice(1).sort()).toEqual(["N1", "N2"]);
    const v1 = el(c, "v1").nodes;
    const c1 = el(c, "c1").nodes;
    const r1 = el(c, "r1").nodes;
    expect(v1[0]).toBe(0);
    expect(r1[1]).toBe(0);
    expect(c1[0]).toBe(v1[1]);
    expect(c1[1]).toBe(r1[0]);
    expect(new Set([v1[1], c1[1]]).size).toBe(2);
    // The ground symbol is a net, not an element.
    expect(c.netlist.elements.map((e) => e.id)).toEqual(["v1", "r1", "c1"]);
  });

  test("is clean and fully indexed", () => {
    expect(c.diagnostics).toEqual([]);
    expect(nodeAt(c, 8, 8)).toBe(el(c, "r1").nodes[0]);
    expect(c.nodes.map((n) => n.index)).toEqual([0, 1, 2]);
    expect(c.segments).toHaveLength(4);
  });
});

test("crossing wires do not connect; a wire end on a wire's middle does", () => {
  const crossing = C(doc([], [wire("a", [0, 5], [10, 5]), wire("b", [5, 0], [5, 10])]));
  expect(nodeAt(crossing, 0, 5)).not.toBe(nodeAt(crossing, 5, 0));
  const tee = C(doc([], [wire("a", [0, 5], [10, 5]), wire("b", [5, 5], [5, 10])]));
  expect(nodeAt(tee, 0, 5)).toBe(nodeAt(tee, 5, 10));
});

test("net labels with the same name join and name the node", () => {
  const d = doc([part("r1", "resistor", 0, 0), part("r2", "resistor", 20, 0)], [], {
    netLabels: {
      a: { id: "a", name: "Vout", at: { x: 4, y: 0 } },
      b: { id: "b", name: "Vout", at: { x: 20, y: 0 } },
      g: { id: "g", name: "GND", at: { x: 0, y: 0 } },
    },
  });
  const c = C(d);
  expect(el(c, "r1").nodes[1]).toBe(el(c, "r2").nodes[0]);
  expect(c.netlist.nodeNames[el(c, "r1").nodes[1]]).toBe("Vout");
  expect(el(c, "r1").nodes[0]).toBe(0);
});

test("node names stay with their oldest terminal across an edit", () => {
  const before = C(rcLoop());
  const name = (c: CompiledCircuit, id: string, t: number) => c.netlist.nodeNames[el(c, id).nodes[t]];
  const n1 = name(before, "c1", 0);
  const n2 = name(before, "r1", 0);
  const after = edit(rcLoop(), (d) => void delete d.parts.v1);
  const kept = C(after, before);
  expect(name(kept, "c1", 0)).toBe(n1);
  expect(name(kept, "r1", 0)).toBe(n2);
  // Without history the names would be reassigned.
  const fresh = C(after);
  expect(name(fresh, "r1", 0)).not.toBe(n2);
  expect(kept.identity).toEqual({ r1: "r1", c1: "c1" });
});

describe("diagnostics", () => {
  test("no ground, with a fix that adds one", () => {
    const d = edit(rcLoop(), (x) => void delete x.parts.g1);
    const c = C(d);
    expect(ids(c)).toEqual(["no-ground"]);
    const fix = c.diagnostics[0].fixes![0];
    const fixed = edit(d, (x) => fix.apply(x));
    expect(ids(C(fixed))).toEqual([]);
  });

  test("floating section and open terminals", () => {
    const d = edit(rcLoop(), (x) => void (x.parts.r9 = part("r9", "resistor", 40, 40)));
    const c = C(d);
    expect(ids(c)).toEqual(["floating-section", "open-terminal", "open-terminal"]);
    expect(c.diagnostics.find((x) => x.id === "floating-section")!.elements).toEqual(["r9"]);
  });

  test("dangling wire end", () => {
    const c = C(edit(rcLoop(), (x) => void (x.wires.wd = wire("wd", [4, 0], [4, -6]))));
    expect(ids(c)).toEqual(["dangling-wire-end"]);
  });

  test("voltage sources in parallel", () => {
    const c = C(
      edit(rcLoop(), (x) => {
        x.parts.v2 = part("v2", "vsource", 0, -8);
        x.wires.a = wire("a", [0, -8], [0, 0]);
        x.wires.b = wire("b", [4, -8], [4, 0]);
      }),
    );
    expect(ids(c)).toEqual(["sources-in-parallel"]);
    expect(c.diagnostics[0].elements.sort()).toEqual(["v1", "v2"]);
  });

  test("short across a source, through a wire or a closed switch", () => {
    const viaWire = C(edit(rcLoop(), (x) => void (x.wires.s = wire("s", [0, 0], [0, -2], [4, -2], [4, 0]))));
    expect(ids(viaWire)).toContain("short-across-source");
    const sw = (closed: boolean) =>
      C(
        edit(rcLoop(), (x) => {
          x.parts.s1 = part("s1", "switch", 0, -4, { props: { closed } });
          x.wires.a = wire("a", [0, -4], [0, 0]);
          x.wires.b = wire("b", [4, -4], [4, 0]);
        }),
      );
    expect(ids(sw(true))).toEqual(["short-across-source"]);
    expect(ids(sw(false))).toEqual([]);
    // The closed switch is still an element, not merged into one node.
    expect(el(sw(true), "s1").nodes[0]).not.toBe(el(sw(true), "s1").nodes[1]);
  });

  test("current source with no path", () => {
    const d = doc([part("i1", "isource", 0, 0), part("g", "ground", 0, 0, { label: "" })], [wire("w", [4, 0], [4, 4])]);
    expect(ids(C(d))).toEqual(["current-source-no-path", "dangling-wire-end"]);
  });

  test("unknown parts and Falstad placeholders", () => {
    const c = C(edit(rcLoop(), (x) => {
      x.parts.m = part("m", "mystery", 50, 50);
      x.parts.f = part("f", "falstad:placeholder", 60, 60);
    }));
    expect(ids(c)).toEqual(["placeholder", "unknown-part"]);
    expect(c.netlist.elements.some((e) => e.id === "m")).toBe(false);
  });

  test("overlapping parts, ammeter in parallel, voltmeter in series", () => {
    const overlap = C(edit(rcLoop(), (x) => void (x.parts.r2 = { ...x.parts.r1, id: "r2", label: "R2" })));
    expect(ids(overlap)).toContain("overlapping-parts");

    const amm = C(edit(rcLoop(), (x) => {
      x.parts.a1 = part("a1", "ammeter", 0, 12, { orientation: { rot: 0, flip: false } });
      x.wires.a = wire("a", [0, 8], [0, 12]);
      x.wires.b = wire("b", [4, 8], [4, 12]);
    }));
    expect(ids(amm)).toContain("ammeter-in-parallel");

    // V1+ -> voltmeter -> C1 instead of a wire.
    const vm = C(edit(rcLoop(), (x) => {
      delete x.wires.w1;
      x.parts.m1 = part("m1", "voltmeter", 4, 0, { length: 4 });
    }));
    expect(ids(vm)).toContain("voltmeter-in-series");
  });
});

test("segment currents on a T junction satisfy KCL", () => {
  // V1+ at (4,0) feeds a T at (8,0): one branch to RA at (12,0), one down to RB at (8,4).
  const d = doc(
    [
      part("v1", "vsource", 0, 0),
      part("ra", "resistor", 12, 0),
      part("rb", "resistor", 8, 4, { orientation: { rot: 90, flip: false } }),
      part("g", "ground", 0, 0, { label: "" }),
    ],
    [wire("wa", [4, 0], [8, 0]), wire("wb", [8, 0], [12, 0]), wire("wc", [8, 0], [8, 4]), wire("loop", [4, 0], [4, -2], [8, -2], [8, 0])],
  );
  const c = C(d);
  const into: Record<string, number> = { "ra:0": 1, "rb:0": 2, "v1:1": -3 };
  const current = (wireId: string, seg = 0) => {
    const s = c.segments.find((x) => x.wire === wireId && x.segment === seg)!;
    return s.terms.reduce((sum, t) => sum + t.sign * (into[`${t.element}:${t.terminal}`] ?? 0), 0);
  };
  expect(current("wb")).toBe(1);
  expect(current("wc")).toBe(2);
  // wa and the parallel loop form a cycle: one is a tree edge carrying 3 A, the other a chord.
  const carried = [current("wa"), current("loop", 0), current("loop", 1), current("loop", 2)];
  expect(carried.filter((x) => x !== 0).every((x) => Math.abs(x) === 3)).toBe(true);
  const chords = c.segments.filter((s) => s.terms.length === 0).map((s) => s.wire);
  expect(chords.length).toBeGreaterThan(0);
});

test("probe targets resolve to channels", () => {
  const d = edit(rcLoop(), (x) => {
    x.probes = {
      across: probe("across", "voltage", { kind: "across", part: "r1" }),
      term: probe("term", "voltage", { kind: "terminal", part: "c1", terminal: 0 }),
      pt: probe("pt", "voltage", { kind: "point", wire: "w2", segment: 1, t: 0.5 }),
      diff: probe("diff", "voltage", { kind: "between", a: { kind: "terminal", part: "v1", terminal: 1 }, b: { kind: "point", wire: "w2", segment: 0, t: 0 } }),
      thru: probe("thru", "current", { kind: "through", part: "r1", reversed: true }),
      seg: probe("seg", "current", { kind: "segment", wire: "w1", segment: 0, reversed: false }),
      pow: probe("pow", "power", { kind: "across", part: "c1" }),
      gone: probe("gone", "voltage", { kind: "across", part: "nope" }),
    };
  });
  const c = C(d);
  const r1 = el(c, "r1").nodes;
  const c1 = el(c, "c1").nodes;
  expect(c.channels.across).toEqual({ id: "across", kind: "voltage", a: r1[0], b: r1[1] });
  expect(c.channels.term).toEqual({ id: "term", kind: "voltage", a: c1[0], b: 0 });
  expect(c.channels.pt).toEqual({ id: "pt", kind: "voltage", a: c1[1], b: 0 });
  expect(c.channels.diff).toEqual({ id: "diff", kind: "voltage", a: c1[0], b: c1[1] });
  expect(c.channels.thru).toEqual({ id: "thru", kind: "current", element: "r1", terminal: 1 });
  // w1 runs V1+ -> C1: its current is the current into C1 terminal 0 (or out of V1 terminal 1).
  expect(c.channels.seg).toEqual({ id: "seg", kind: "current", element: "c1", terminal: 0 });
  expect(c.channels.pow).toEqual({ id: "pow", kind: "power", element: "c1" });
  expect(c.channels.gone).toBeUndefined();
});

test("subcircuit instances flatten with hierarchical ids", () => {
  const d = doc([part("u1", "subcircuit", 20, 0, { label: "U1", props: { definition: "d1", pins: 2 } })], [], {
    subcircuits: {
      d1: {
        id: "d1",
        name: "Divider",
        parts: { ra: part("ra", "resistor", 0, 0), rb: part("rb", "resistor", 4, 0, { orientation: { rot: 90, flip: false } }) },
        wires: { w: wire("w", [4, 4], [0, 4], [0, 2]) },
        netLabels: {},
        pins: [
          { name: "in", at: { x: 0, y: 0 }, side: "left" },
          { name: "out", at: { x: 0, y: 2 }, side: "left" },
        ],
      },
    },
  });
  const c = C(d);
  const ra = el(c, "u1/ra");
  const rb = el(c, "u1/rb");
  expect(ra.nodes[0]).toBe(nodeAt(c, 20, 0));
  expect(rb.nodes[1]).toBe(nodeAt(c, 20, 2));
  expect(ra.nodes[1]).toBe(rb.nodes[0]);
  expect(c.netlist.nodeNames[ra.nodes[1]]).toMatch(/^U1\/N\d+$/);
});

test("digital pins mark nodes digital or mixed", () => {
  const c = C(doc([part("g1", "gate", 0, 0), part("r1", "resistor", 4, 0)]));
  expect(c.nodes[el(c, "g1").nodes[0]].kind).toBe("digital");
  expect(c.nodes[el(c, "g1").nodes[1]].kind).toBe("mixed");
});
