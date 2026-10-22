// Agent "analog2" parts: imported terminals land on CircuitJS1's posts
// (SCRElm, TriacElm, TriodeElm, UnijunctionElm setPoints()), tokens map to props,
// and parts export back (FIL-19).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDescriptor, terminalPositions } from "@cs/elements";
import { exportFalstad, importFalstad } from "@cs/formats";

const library = (name: string) => readFileSync(fileURLToPath(new URL(`../../../public/circuits/${name}`, import.meta.url)), "utf8");

function one(line: string) {
  const { doc, report } = importFalstad(`$ 1 5.0E-6 10 50 5.0 50\n${line}\n`);
  expect(report.unsupported).toEqual([]);
  const part = Object.values(doc.parts)[0];
  const posts = terminalPositions(part, getDescriptor(part.type)!).map((p) => [p.x * 16, p.y * 16]);
  const wires = Object.values(doc.wires).map((w) => w.points.map((p) => [p.x * 16, p.y * 16]));
  return { doc, part, posts, wires, warnings: report.warnings.map((w) => w.message.key) };
}

describe("Falstad import of the analog2 parts", () => {
  test.each([
    // Lines from the example library; posts as CircuitJS1 computes them.
    ["SCR (scr.txt)", "177 384 160 368 288 0 0.0 0.0", "scr", [[384, 160], [384, 288], [352, 256]]],
    ["SCR (scractrig.txt)", "177 256 176 256 352 0 -15.05 -15.05", "scr", [[256, 176], [256, 352], [288, 288]]],
    ["triac (triacdimmer.txt)", "206 1360 272 1312 528 0 0.011 0.008 100 false", "triac", [[1360, 272], [1360, 528], [1328, 432]]],
    ["triode (triode.txt)", "173 304 240 368 240 0 93.0 680.0", "triode", [[304, 240], [368, 208], [352, 272]]],
    ["unijunction (ujtosc.txt)", "417 416 176 496 176 1", "unijunction", [[416, 176], [496, 208], [496, 176]]],
    ["antenna (amdetect.txt)", "A 144 144 144 112 0", "antenna", [[144, 144]]],
    ["tunnel diode", "175 320 208 320 288 0", "tunnel-diode", [[320, 208], [320, 288]]],
  ])("%s", (_name, line, type, posts) => {
    const r = one(line);
    expect(r.part.type).toBe(type);
    expect(r.posts).toEqual(posts);
    expect(r.wires).toEqual([]);
  });

  test("tokens become props and state", () => {
    expect(one("176 560 256 560 352 1 0.805904783 -0.94 4e-12").part).toMatchObject({
      type: "varactor",
      props: { baseCapacitance: 4e-12, forwardVoltage: 0.805904783 },
      savedState: [-0.94, 0, 0, -0.94],
    });
    expect(one("187 320 240 320 336 0 10000.0 1.0E9 1000.0 0.0010").part.props).toEqual({
      onResistance: 10000,
      offResistance: 1e9,
      breakdownVoltage: 1000,
      holdingCurrent: 0.001,
    });
    expect(one("203 1264 432 1328 432 0 500 100000000 30 0.01").part).toMatchObject({ type: "diac", props: { breakdownVoltage: 30 } });
    expect(one("209 320 144 320 256 4 1e-5 6.04 0.001 0 1").part).toMatchObject({
      type: "polar-capacitor",
      props: { capacitance: 1e-5, seriesResistance: 0, maxReverseVoltage: 1 },
      savedState: [6.04, 0, 0],
    });
  });

  test("XML: polarized capacitor and crystal", () => {
    const boost = importFalstad(library("conv-boost.txt"));
    expect(boost.report.unsupported).toEqual([]);
    const pc = Object.values(boost.doc.parts).find((p) => p.type === "polar-capacitor")!;
    expect(pc.props).toMatchObject({ capacitance: 1e-5, maxReverseVoltage: 1 });
    expect(pc.savedState?.[0]).toBeCloseTo(6.0406, 3);
    const osc = importFalstad(library("crystalosc.txt"));
    expect(osc.report.unsupported).toEqual([]);
    const xtal = Object.values(osc.doc.parts).find((p) => p.type === "crystal")!;
    expect(xtal.props.seriesCapacitance).toBe(1e-13);
    expect(xtal.props.parallelCapacitance).toBe(2.87e-11);
    expect(xtal.props.frequency as number).toBeCloseTo(1 / (2 * Math.PI * Math.sqrt(0.0025 * 1e-13)), 0);
  });

  test("the library files import with no placeholders and export back", () => {
    for (const f of ["tdosc.txt", "varactorvco.txt", "spark-marx.txt", "scractrig.txt", "triodeamp.txt", "triacdimmer.txt", "ujtosc.txt", "amdetect.txt", "crystalosc2.txt"]) {
      const { doc, report } = importFalstad(library(f));
      expect(report.unsupported, f).toEqual([]);
      const out = exportFalstad(doc);
      expect(out.report.skipped, f).toEqual([]);
      const back = importFalstad(out.text).doc;
      const where = (d: typeof doc) => new Set(Object.values(d.parts).map((p) => `${p.type}@${p.at.x},${p.at.y}`));
      const again = where(back);
      for (const k of where(doc)) expect(again.has(k), `${f}: ${k}`).toBe(true);
    }
  });
});
