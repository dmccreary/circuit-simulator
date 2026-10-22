import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPartResolver } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { createEngine } from "@cs/engine";
import { compile, decodeLayout } from "@cs/model";
import { importFalstad } from "@cs/formats";

const library = (name: string) => readFileSync(fileURLToPath(new URL(`../../../public/circuits/${name}`, import.meta.url)), "utf8");
const resolver = createPartResolver();

describe("Falstad custom subcircuits (code 410)", () => {
  test("fullrect-sc.txt: the <ccm> model becomes a definition and <cc> an instance", () => {
    const { doc, report } = importFalstad(library("fullrect-sc.txt"));
    expect(report.unsupported).toEqual([]);
    const def = doc.subcircuits["falstad-fullrect"];
    expect(def.name).toBe("fullrect");
    expect(def.pins.map((p) => [p.name, p.side])).toEqual([
      ["in", "left"],
      ["in-", "left"],
      ["out", "right"],
      ["out-", "right"],
    ]);
    expect(Object.values(def.parts).filter((p) => p.type === "diode")).toHaveLength(4);
    const inst = Object.values(doc.parts).find((p) => p.type === "subcircuit")!;
    expect(inst.label).toBe("U1");
    expect(inst.props.definition).toBe("falstad-fullrect");
    // Falstad's chip and ours share the pin grid, so no joining wires are needed.
    expect(resolver.terminals(inst)).toEqual([
      { x: 45, y: 23 },
      { x: 45, y: 25 },
      { x: 51, y: 23 },
      { x: 51, y: 25 },
    ]);
    expect(decodeLayout(inst.props.pinLayout)).toMatchObject({ sizeX: 2, sizeY: 2 });
  });

  test("the imported bridge rectifies: the load voltage never goes negative", () => {
    const { doc } = importFalstad(library("fullrect-sc.txt"));
    const c = compile(doc, resolver);
    expect(c.diagnostics.filter((d) => d.id === "unknown-part" || d.id === "placeholder")).toEqual([]);
    expect(c.netlist.elements.filter((e) => e.type === "diode").map((e) => e.id.split("/")[0])).toHaveLength(4);
    const load = Object.values(doc.parts).find((p) => p.type === "resistor")!;
    const r = c.netlist.elements.find((e) => e.id === load.id)!;
    const e = createEngine(c.netlist, getModelFactory);
    e.setChannels([{ id: "v", kind: "voltage", a: r.nodes[0], b: r.nodes[1] }]);
    const vals: number[] = [];
    while (e.time < 0.05) {
      const out = e.step();
      expect(out.ok).toBe(true);
      const b = e.drainSamples();
      vals.push(...b.samples.subarray(0, b.times.length));
    }
    const peak = Math.max(...vals.map(Math.abs));
    expect(peak).toBeGreaterThan(3);
    // Full-wave: one polarity only (sign depends on which way R1 was drawn).
    const sign = Math.sign(vals.reduce((a, v) => (Math.abs(v) > Math.abs(a) ? v : a), 0));
    expect(Math.min(...vals.map((v) => v * sign))).toBeGreaterThan(-0.05);
  });

  test.each(["adder4-sc.txt", "brentkung.txt", "td4.txt", "td4-ctr.txt", "td4-add2.txt"])("%s imports every 410 instance", (name) => {
    const { doc, report } = importFalstad(library(name));
    expect(report.unsupported.filter((u) => u.code === "410")).toEqual([]);
    expect(Object.values(doc.parts).filter((p) => p.type === "subcircuit").length).toBeGreaterThan(0);
    const c = compile(doc, resolver);
    expect(c.diagnostics.filter((d) => d.id === "unknown-part" && d.elements.some((id) => id.includes("/")))).toEqual([]);
  });

  test("text-format '.' model lines are read too", () => {
    const text = [
      "$ 1 0.000005 10 50 5 50",
      ". div 0 2 2 2 top 1 0 2 mid 2 0 3 ResistorElm\\s1\\s2\\rResistorElm\\s2\\s0 \\s0\\\\s1000\\s0\\\\s3000",
      "410 64 64 128 64 1 div",
      "v 64 64 64 160 0 0 40 4 0 0 0.5",
      "g 64 160 64 176 0",
    ].join("\n");
    const { doc, report } = importFalstad(text);
    expect(report.unsupported).toEqual([]);
    const def = doc.subcircuits["falstad-div"];
    expect(Object.values(def.parts).map((p) => p.props.resistance).sort()).toEqual([1000, 3000]);
    const c = compile(doc, resolver);
    const r1 = c.netlist.elements.filter((e) => e.type === "resistor");
    expect(r1).toHaveLength(2);
    // Both resistors share the inner node 2.
    expect(r1[0].nodes[1]).toBe(r1[1].nodes[0]);
  });
});
