import { nextLabel, normalize, produce, type CircuitDocument, type NormalizeOptions, type Probe, type ProbeTarget } from "@cs/model";
import { doc, part, resolver, wire } from "./fixtures";

const run = (d: CircuitDocument, opts?: NormalizeOptions) => produce(d, (draft) => normalize(draft, resolver, opts)).doc;
const pts = (d: CircuitDocument) =>
  Object.values(d.wires)
    .map((w) => w.points.map((p) => `${p.x},${p.y}`).join(" "))
    .sort();

function probe(id: string, target: ProbeTarget, quantity: Probe["quantity"] = "voltage"): Probe {
  return {
    id,
    name: id,
    quantity,
    target,
    style: { color: "probe.1", width: 1 },
    lane: "l1",
    flag: { offset: { x: 0, y: 0 }, showValue: false },
    measurements: [],
  };
}

test("already-normal documents are left untouched", () => {
  const d = doc([part("r1", "resistor", 0, 0)], [wire("w1", [4, 0], [4, 4], [8, 4])]);
  expect(run(d)).toBe(d);
});

test("zero-length wires are removed and duplicate points collapse", () => {
  const d = doc([], [wire("w1", [3, 3], [3, 3]), wire("w2", [0, 0], [0, 0], [0, 5])]);
  const out = run(d);
  expect(out.wires.w1).toBeUndefined();
  expect(out.wires.w2.points).toEqual([{ x: 0, y: 0 }, { x: 0, y: 5 }]);
});

test("straight runs merge into one wire; bends and junctions do not", () => {
  expect(pts(run(doc([], [wire("w1", [0, 0], [5, 0]), wire("w2", [10, 0], [5, 0])])))).toEqual(["0,0 10,0"]);
  expect(pts(run(doc([], [wire("w1", [0, 0], [5, 0], [10, 0])])))).toEqual(["0,0 10,0"]);
  expect(pts(run(doc([], [wire("w1", [0, 0], [5, 0]), wire("w2", [5, 0], [5, 5])])))).toEqual(["0,0 5,0", "5,0 5,5"]);
  // A terminal at the joint keeps the wires apart.
  const withPart = doc([part("r1", "resistor", 5, 0, { orientation: { rot: 90, flip: false } })], [wire("w1", [0, 0], [5, 0]), wire("w2", [5, 0], [10, 0])]);
  expect(pts(run(withPart))).toEqual(["0,0 5,0", "5,0 10,0"]);
});

test("a wire end on the middle of a wire splits it (EDT-11)", () => {
  const out = run(doc([], [wire("w1", [0, 0], [10, 0]), wire("w2", [5, 0], [5, 5])]));
  expect(pts(out)).toEqual(["0,0 5,0", "5,0 10,0", "5,0 5,5"]);
  expect(out.wires.w1.points).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }]);
});

test("a part terminal on the middle of a wire splits it", () => {
  const d = doc([part("r1", "resistor", 5, 0, { orientation: { rot: 90, flip: false } })], [wire("w1", [0, 0], [10, 0])]);
  expect(pts(run(d))).toEqual(["0,0 5,0", "5,0 10,0"]);
});

test("a two-terminal part dropped on a wire is inserted in series (EDT-06)", () => {
  const d = doc([part("r1", "resistor", 8, 0)], [wire("w1", [0, 0], [20, 0])]);
  expect(pts(run(d))).toEqual(["0,0 8,0", "12,0 20,0"]);
  // Without insertion the terminals still split the wire, leaving the part shorted.
  expect(pts(run(d, { insertOnDrop: false }))).toEqual(["0,0 8,0", "12,0 20,0", "8,0 12,0"]);
});

test("empty labels get the next free label", () => {
  const d = doc([
    part("a", "resistor", 0, 0, { label: "R1" }),
    part("b", "resistor", 0, 4, { label: "" }),
    part("c", "resistor", 0, 8, { label: "" }),
    part("d", "capacitor", 0, 12, { label: "" }),
    part("g", "ground", 0, 16, { label: "" }),
  ]);
  const out = run(d, { labelPrefix: (t) => ({ resistor: "R", capacitor: "C" })[t] });
  expect([out.parts.b.label, out.parts.c.label, out.parts.d.label, out.parts.g.label]).toEqual(["R2", "R3", "C1", ""]);
  expect(nextLabel(out, "R")).toBe("R4");
});

test("probes and sliders whose target was deleted are removed (PRB-12)", () => {
  const d = doc([part("r1", "resistor", 0, 0)], [wire("w1", [4, 0], [4, 4])], {
    probes: {
      p1: probe("p1", { kind: "across", part: "gone" }),
      p2: probe("p2", { kind: "between", a: { kind: "terminal", part: "r1", terminal: 0 }, b: { kind: "point", wire: "nope", segment: 0, t: 0.5 } }),
      p3: probe("p3", { kind: "across", part: "r1" }),
    },
    sliders: { s1: { id: "s1", part: "gone", prop: "resistance", min: 1, max: 2 } },
  });
  const out = run(d);
  expect(Object.keys(out.probes)).toEqual(["p3"]);
  expect(out.probes.p3).toBe(d.probes.p3);
  expect(out.sliders).toEqual({});
});

test("wire probes follow their place when wires merge or split", () => {
  const d = doc([], [wire("w1", [0, 0], [5, 0]), wire("w2", [10, 0], [5, 0])], {
    probes: {
      p1: probe("p1", { kind: "segment", wire: "w2", segment: 0, reversed: false }, "current"),
      p2: probe("p2", { kind: "point", wire: "w2", segment: 0, t: 0.2 }),
    },
  });
  const out = run(d);
  expect(Object.keys(out.wires)).toEqual(["w1"]);
  // w2 ran right-to-left; the merged wire runs left-to-right, so the direction flips.
  expect(out.probes.p1.target).toEqual({ kind: "segment", wire: "w1", segment: 0, reversed: true });
  expect(out.probes.p2.target).toEqual({ kind: "point", wire: "w1", segment: 0, t: 0.9 });
});
