// "analogic" parts: imported terminals land on the posts CircuitJS1 computes
// (GyratorElm, TappedTransformerElm, DarlingtonElm, OTAElm, NortonAmpElm,
// RelayCoilElm/RelayContactElm, ThreePhaseMotorElm, VCOElm, PhaseCompElm,
// SchmittElm setPoints()), and the library files import and export back.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDescriptor, terminalPositions } from "@cs/elements";
import { exportFalstad, importFalstad } from "@cs/formats";

const library = (f: string) => readFileSync(fileURLToPath(new URL(`../../../public/circuits/${f}`, import.meta.url)), "utf8");

function one(text: string) {
  const { doc, report } = importFalstad(text.includes("<cir") ? text : `$ 1 5.0E-6 10 50 5.0 50\n${text}\n`);
  expect(report.unsupported).toEqual([]);
  const part = Object.values(doc.parts)[0];
  const posts = terminalPositions(part, getDescriptor(part.type)!).map((p) => [p.x * 16, p.y * 16]);
  return { part, posts, doc };
}

const OTA_LINE =
  "402 512 528 624 528 0 0_0_40_-9_0_0_0.5 0_0_40_9_0_0_0.5 " + Array.from({ length: 16 }, (_, i) => (i >= 5 && i < 11 ? "0_-1_0_0_100" : "0_1_0_0_100")).join(" ");

describe("Falstad placement of the analogic parts", () => {
  test.each([
    ["gyrator (gyratorelm.txt)", '<cir f="1"><Gyrator x="304 160 416 160" f="0"/></cir>', "gyrator", [[304, 160], [416, 160], [304, 192], [416, 192]]],
    ["tapped transformer (ringmod.txt)", "169 144 144 208 144 0 0.1 1.0 0.36 -0.11", "tapped-transformer", [[144, 144], [144, 208], [208, 144], [208, 176], [208, 208]]],
    ["tapped transformer, right to left", "169 496 208 432 208 0 0.1 1.0 -0.33 0.016", "tapped-transformer", [[496, 208], [496, 144], [432, 208], [432, 176], [432, 144]]],
    ["darlington (ota-vcf-single.txt)", "400 368 464 416 464 0 0_1_-7.17_0.46_100 0_1_-7.63_0.57_100 1", "npn-darlington", [[368, 464], [416, 448], [416, 480]]],
    ["OTA (ota-vca.txt)", OTA_LINE, "ota", [[512, 496], [512, 560], [512, 528], [608, 496], [624, 528]]],
    ["norton amp (norton-saw.txt)", '<cir f="1"><nor x="288 352 384 352" f="1"/></cir>', "norton-amp", [[288, 368], [288, 336], [384, 352]]],
    ["relay coil (latchingrelay.txt)", "425 448 480 448 624 0 Q1 0.2 0 0.02 20 0.015 0.005 3 0 1", "relay-coil", [[448, 480], [448, 624], [432, 544]]],
    ["relay contact (latchingrelay.txt)", "426 624 384 624 624 4 Q1 0.05 1000000 0", "relay-contact", [[624, 384], [624, 624], [608, 496]]],
    ["3-phase motor (3motor.txt)", "427 608 224 752 224 0 0.067 0.032 0.0294 0.0297 0.0287 0.05 0.067", "three-phase-motor",
      [[608, 192], [752, 256], [608, 224], [752, 224], [608, 256], [752, 192]]],
    ["VCO (pll.txt)", "158 432 224 464 224 0", "vco", [[432, 224], [432, 320], [528, 224], [528, 256], [528, 288], [528, 320]]],
    ["phase comparator (phasecomp.txt)", "161 272 208 304 208 0", "phase-comparator", [[272, 208], [272, 240], [368, 208]]],
    ["schmitt (qam-256.txt)", "182 160 240 224 240 0 0.5 0 0.000001 5 0", "schmitt-trigger", [[160, 240], [224, 240]]],
    ["inverting schmitt (delta-pwm.txt, doubled)", "183 560 400 656 400 0 0.5 -0.1 0.1", "inverting-schmitt-trigger", [[560, 400], [656, 400]]],
  ] as const)("%s", (_name, line, type, posts) => {
    const r = one(line);
    expect(r.part.type).toBe(type);
    expect(r.posts).toEqual(posts);
  });

  test("tokens become props", () => {
    expect(one("183 280 200 328 200 0 0.5 -0.1 0.1").part.props).toMatchObject({ lowerThreshold: -0.1, upperThreshold: 0.1, highLevel: 5, lowLevel: 0 });
    expect(one(OTA_LINE).part.props).toEqual({ negSupply: -9, posSupply: 9 });
    const coil = one("425 448 480 448 624 0 Q1 0.2 0 0.02 20 0.015 0.005 3 0 1");
    expect(coil.part.props).toMatchObject({ link: "Q1", coilType: "latching", initiallyOn: true, coilResistance: 20, offCurrent: 0.015 });
    // The coil's "arm" terminal carries the net label that links it to its contacts.
    const labels = Object.values(coil.doc.netLabels);
    expect(labels.map((l) => [l.name, l.at.x * 16, l.at.y * 16])).toEqual([["Q1.arm", 432, 544]]);
    expect(one("426 624 384 624 624 4 Q1 0.05 1000000 0").part.props).toMatchObject({ link: "Q1", initiallyEnergized: true, normallyClosed: false });
  });

  test("the library files import with no placeholders", () => {
    for (const f of ["gyratorelm.txt", "ringmod.txt", "ota-vca.txt", "ota-gain.txt", "ota-vcf-single.txt", "ota-ringmod.txt", "norton-invert.txt", "norton-noninvert.txt",
      "norton-saw.txt", "latchingrelay.txt", "3motor.txt", "pll.txt", "phasecomp.txt", "pll2.txt", "pll2a.txt", "freqdouble.txt", "delta-pwm.txt"]) {
      expect(importFalstad(library(f)).report.unsupported, f).toEqual([]);
    }
  });

  test("text library files export back to the same placements", () => {
    for (const f of ["ota-vca.txt", "latchingrelay.txt", "3motor.txt", "pll.txt", "phasecomp.txt", "delta-pwm.txt"]) {
      const { doc } = importFalstad(library(f));
      const out = exportFalstad(doc);
      const ours = new Set(["ota", "relay-coil", "relay-contact", "three-phase-motor", "vco", "phase-comparator", "inverting-schmitt-trigger"]);
      expect(out.report.skipped.filter((s) => ours.has(s.type)), f).toEqual([]);
      const back = importFalstad(out.text).doc;
      const where = (d: typeof doc) => new Set(Object.values(d.parts).filter((p) => ours.has(p.type)).map((p) => `${p.type}@${p.at.x},${p.at.y}`));
      const again = where(back);
      for (const k of where(doc)) expect(again.has(k), `${f}: ${k}`).toBe(true);
    }
  });
});
