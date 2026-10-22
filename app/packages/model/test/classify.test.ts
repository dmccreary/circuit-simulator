import { classify, paramChanges, produce } from "@cs/model";
import { part, rcLoop } from "./fixtures";

const patchesOf = (f: Parameters<typeof produce<ReturnType<typeof rcLoop>>>[1]) => produce(rcLoop(), f);

test("prop values are params; cosmetic edits are none; geometry is topology", () => {
  expect(classify(patchesOf((d) => void (d.parts.r1.props.resistance = 2200)).patches)).toBe("params");
  expect(classify(patchesOf((d) => void (d.parts.r1.label = "RX")).patches)).toBe("none");
  expect(classify(patchesOf((d) => void (d.meta.title = "t")).patches)).toBe("none");
  expect(classify(patchesOf((d) => void (d.view.zoom = 2)).patches)).toBe("none");
  expect(classify(patchesOf((d) => void (d.parts.r1.at.x = 9)).patches)).toBe("topology");
  expect(classify(patchesOf((d) => void (d.parts.r9 = part("r9", "resistor", 0, 0))).patches)).toBe("topology");
  expect(classify(patchesOf((d) => void delete d.wires.w1).patches)).toBe("topology");
  expect(classify(patchesOf((d) => void (d.netLabels.n = { id: "n", name: "A", at: { x: 0, y: 0 } })).patches)).toBe("topology");
  expect(classify([])).toBe("none");
});

test("probe style is none; probe target is topology", () => {
  const withProbe = produce(rcLoop(), (d) => {
    d.probes.p = {
      id: "p",
      name: "V1",
      quantity: "voltage",
      target: { kind: "across", part: "r1" },
      style: { color: "probe.1", width: 1 },
      lane: "l",
      flag: { offset: { x: 0, y: 0 }, showValue: false },
      measurements: [],
    };
  }).doc;
  expect(classify(produce(withProbe, (d) => void (d.probes.p.style.width = 2)).patches)).toBe("none");
  expect(classify(produce(withProbe, (d) => void (d.probes.p.target = { kind: "across", part: "c1" })).patches)).toBe("topology");
});

test("paramChanges lists element, param and value", () => {
  const r = patchesOf((d) => {
    d.parts.r1.props.resistance = 2200;
    d.parts.c1.props.capacitance = 1e-3;
    d.parts.r1.label = "RX";
  });
  expect(classify(r.patches)).toBe("params");
  expect(paramChanges(r.patches, r.doc)).toEqual([
    { element: "r1", param: "resistance", value: 2200 },
    { element: "c1", param: "capacitance", value: 1e-3 },
  ]);
});
