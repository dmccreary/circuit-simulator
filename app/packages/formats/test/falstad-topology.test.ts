// Import keeps CircuitJS1's connectivity: posts join only at shared points
// (wire-hops.ts), diagonal parts are straightened without shorts (diagonals.ts),
// and canvas-only elements (ScopeElm, BoxElm, LineElm) become lanes, boxes or nothing.
import { createPartResolver } from "@cs/elements";
import { importFalstad } from "@cs/formats";
import { compile } from "@cs/model";

const netOf = (text: string) => {
  const { doc, report } = importFalstad(text);
  const nl = compile(doc, createPartResolver()).netlist;
  const nodes = (label: string) => nl.elements.find((e) => doc.parts[e.id]?.label === label)!.nodes;
  return { doc, report, nl, nodes };
};

describe("wires that run past a post", () => {
  test("a wire end on the middle of another wire does not join it (CircuitJS1 pointKey)", () => {
    // R3's wire ends at (64, 64), in the middle of the vertical wire from (64, 0) to (64, 128).
    const text = [
      "$ 1 0.000005 10 50 5 50",
      "r 0 0 64 0 0 100", // R1: (0,0)-(64,0)
      "w 64 0 64 128 0",
      "r 0 128 64 128 0 100", // R2 ends on the long wire's far end
      "r 0 64 32 64 0 100", // R3
      "w 32 64 64 64 0", // ends mid-wire
      "g 0 0 0 16 0",
    ].join("\n");
    const { nodes, doc } = netOf(text);
    expect(nodes("R1")[1]).toBe(nodes("R2")[1]);
    expect(nodes("R3")[1]).not.toBe(nodes("R1")[1]);
    expect(Object.values(doc.wires).some((w) => w.points.length > 2)).toBe(true); // the hop
  });
});

describe("diagonal parts", () => {
  test("a diamond bridge rectifier keeps four distinct corners", () => {
    // fullrect.txt from the library: four diodes drawn at 45°.
    const text = [
      "$ 1 5.0E-6 10 53 5.0 50",
      "v 160 352 160 64 0 1 40.0 5.0 0.0",
      "w 160 64 304 64 0",
      "w 304 64 304 128 0",
      "d 304 128 368 192 0",
      "d 304 256 368 192 0",
      "d 240 192 304 128 0",
      "d 240 192 304 256 0",
      "w 304 256 304 352 0",
      "w 304 352 160 352 0",
      "w 240 192 240 288 0",
      "w 368 192 416 192 0",
      "w 240 288 416 288 0",
      "r 416 192 416 288 0 100.0",
    ].join("\n");
    const { nl } = netOf(text);
    const diodes = nl.elements.filter((e) => e.type === "diode");
    expect(diodes).toHaveLength(4);
    for (const d of diodes) expect(d.nodes[0]).not.toBe(d.nodes[1]);
    expect(new Set(diodes.flatMap((d) => d.nodes)).size).toBe(4);
  });
});

describe("canvas-only elements", () => {
  test("ScopeElm (403) becomes a chart lane for its element; BoxElm a box; LineElm is dropped", () => {
    const text = [
      "$ 1 0.000005 10 50 5 50",
      "r 0 0 64 0 0 100",
      "g 0 0 0 16 0",
      "g 64 0 64 16 0",
      "403 128 0 192 64 0 0_64_0_4102_5_0.1_0_2_0_3",
      "b 0 64 96 128 0",
      "423 0 160 96 160 0",
    ].join("\n");
    const { doc, report } = importFalstad(text);
    expect(report.unsupported).toEqual([]);
    expect(Object.values(doc.probes)).toHaveLength(1);
    expect(Object.values(doc.annotations).filter((a) => a.kind === "box")).toHaveLength(1);
    expect(report.warnings.map((w) => w.message.key)).toContain("falstad.lineSkipped");
  });
});
