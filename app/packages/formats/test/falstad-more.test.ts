// Parts added for library compatibility: imported terminals must land on the
// posts CircuitJS1 computes (GateElm, ChipElm, RelayElm, TransLineElm,
// AnalogSwitchElm, Switch2Elm, PotElm, RailElm... setPoints()).
import { getDescriptor, terminalPositions } from "@cs/elements";
import { importFalstad } from "@cs/formats";

/** Import one element line; return its part, terminal positions and extra wires in Falstad pixels. */
function one(line: string) {
  const { doc, report } = importFalstad(`$ 1 5.0E-6 10 50 5.0 50\n${line}\n`);
  expect(report.unsupported).toEqual([]);
  const part = Object.values(doc.parts)[0];
  const posts = terminalPositions(part, getDescriptor(part.type)!).map((p) => [p.x * 16, p.y * 16]);
  const wires = Object.values(doc.wires).map((w) => w.points.map((p) => [p.x * 16, p.y * 16]));
  return { part, posts, wires, warnings: report.warnings.map((w) => w.message.key) };
}

describe("Falstad placement of the added parts", () => {
  test.each([
    ["AND gate", "150 256 160 352 160 0 2 0", "and-gate", [[256, 176], [256, 144], [352, 160]]],
    ["3-input NAND", "151 256 160 352 160 0 3 0", "nand-gate-3", [[256, 176], [256, 160], [256, 144], [352, 160]]],
    ["4-input OR, downward", "152 256 160 256 256 0 4 0", "or-gate-4", [[224, 160], [240, 160], [272, 160], [288, 160], [256, 256]]],
    ["inverter", "I 256 160 352 160 0 0.5 5", "not-gate", [[256, 160], [352, 160]]],
    ["logic input", "L 176 128 128 128 0 1 false 5 0", "logic-input", [[176, 128]]],
    ["logic output", "M 400 128 448 128 0 2.5", "logic-output", [[400, 128]]],
    ["rail", "R 336 96 336 48 0 0 40 10 0 0 0.5", "rail", [[336, 96]]],
    ["output", "O 240 208 304 208 1", "voltage-readout", [[240, 208]]],
    ["JK flip-flop", "156 128 240 144 240 0 0 0", "jk-flip-flop", [[128, 240], [128, 272], [128, 304], [224, 240], [224, 304]]],
    ["555 timer", "165 224 144 272 144 4 5", "timer-555",
      [[224, 176], [224, 240], [224, 272], [288, 112], [288, 304], [352, 208], [352, 176], [320, 304]]],
    ["relay", "178 128 160 208 160 22 1 0.1 0 0.05 1000000 0.02 50 0.02 0.005 0", "relay",
      [[128, 160], [208, 144], [208, 176], [128, 192], [208, 192]]],
    ["2-pole relay, leftward", "178 208 160 128 160 22 2 0.1 0 0.05 1000000 0.02 50 0.02 0.005 0", "relay-2",
      [[208, 160], [128, 144], [128, 176], [208, 112], [128, 96], [128, 128], [208, 192], [128, 192]]],
    ["transmission line", "171 112 192 256 192 0 1e-8 75 64 0", "transmission-line", [[112, 192], [256, 192], [112, 256], [256, 256]]],
    ["analog switch", "159 256 160 352 160 0 20 1e10 2.5", "analog-switch", [[256, 160], [352, 160], [304, 176]]],
    ["analog changeover", "160 256 160 352 160 0 20 1e10 2.5", "analog-switch-2", [[256, 160], [352, 144], [352, 176], [304, 144]]],
    ["SPDT switch", "S 256 144 256 64 0 0 false 0 2", "spdt-switch", [[256, 144], [240, 64], [272, 64]]],
    ["current conveyor", "179 272 224 304 224 0 1.0", "current-conveyor", [[272, 224], [272, 288], [368, 256]]],
    ["potentiometer, wiper below a leftward pot", "174 144 240 80 272 0 100 0.7 X", "potentiometer", [[144, 240], [80, 240], [112, 272]]],
  ])("%s", (_name, line, type, expected) => {
    const { part, posts } = one(line);
    expect(part.type).toBe(type);
    expect(posts).toEqual(expected);
  });

  test("a D flip-flop gets a wire from our Q̄ to Falstad's", () => {
    const { part, posts, wires } = one("155 128 240 144 240 0 0 0");
    expect(part.type).toBe("d-flip-flop");
    expect(posts.slice(0, 4)).toEqual([[128, 240], [128, 272], [224, 240], [224, 272]]);
    expect(wires).toEqual([[[224, 272], [224, 304]]]);
  });

  test("a wider transmission line gets wires to Falstad's return posts", () => {
    const { wires } = one("171 112 192 256 192 0 1e-8 75 80 0");
    expect(wires).toEqual([
      [[112, 256], [112, 272]],
      [[256, 256], [256, 272]],
    ]);
  });

  test("a potentiometer with a one-square wiper offset gets a wire to Falstad's wiper", () => {
    const { posts, wires } = one("174 64 64 128 80 0 1000 0.5 R");
    expect(posts).toEqual([[64, 64], [128, 64], [96, 96]]);
    expect(wires).toEqual([[[96, 96], [96, 80]]]);
  });

  test("props come across", () => {
    expect(one("R 336 96 336 48 0 2 1000 2.5 2.5 0 0.25").part.props).toMatchObject({ waveform: "square", voltage: 2.5, offset: 2.5, frequency: 1000, dutyCycle: 25 });
    expect(one("L 176 128 128 128 0 0 false 3.3 0").part.props).toEqual({ high: false, supply: 3.3 });
    expect(one("170 64 64 128 64 1 20 4000 5 0.1").part.props).toMatchObject({ waveform: "sweep", frequency: 20, maxFrequency: 4000, logSweep: true });
    expect(one("v 0 0 0 64 0 3 100 2 0 0 0.5").part).toMatchObject({ type: "waveform-source", props: { waveform: "triangle", voltage: 2, frequency: 100 } });
    expect(one("m 0 0 64 0 0 100 16000 0 1e-8 1e-10").part.props).toMatchObject({ onResistance: 100, offResistance: 16000 });
    expect(one("j 304 240 352 240 0 -4 0.00125").part).toMatchObject({ type: "n-mosfet", props: { threshold: -4, beta: 0.00125 } });
    const relay = one("178 128 160 208 160 22 1 0.1 0 0.05 1000000 0.02 50 0.015 0.005 0").part.props;
    expect(relay).toEqual({
      coilInductance: 0.1,
      onResistance: 0.05,
      offResistance: 1e6,
      onCurrent: 0.02,
      coilResistance: 50,
      offCurrent: 0.015,
      switchingTime: 0.005,
    });
  });

  test("a variable rail keeps its slider", () => {
    const { doc } = importFalstad("172 304 176 304 128 0 6 5.0 5.0 0.0 0.0 0.5 Voltage\n");
    expect(Object.values(doc.sliders)).toEqual([expect.objectContaining({ prop: "voltage", min: 0, max: 5 })]);
  });

  test("labeled nodes become a lead wire and a net label", () => {
    const { doc } = importFalstad("207 64 64 64 32 4 V\\sout\n");
    expect(Object.values(doc.netLabels)).toEqual([expect.objectContaining({ name: "V out", at: { x: 4, y: 2 } })]);
    expect(Object.values(doc.wires)).toHaveLength(1);
  });

  test("a straightened diagonal part keeps its far end connected through a wire", () => {
    const { doc } = importFalstad("r 0 0 64 32 0 100\n");
    const r = Object.values(doc.parts)[0];
    expect(r).toMatchObject({ at: { x: 0, y: 0 }, length: 4, orientation: { rot: 0 } });
    expect(Object.values(doc.wires).map((w) => w.points)).toEqual([[{ x: 4, y: 0 }, { x: 4, y: 2 }]]);
  });

  test("parts whose posts cannot land on our grid stay placeholders", () => {
    // A De Morgan gate (FLAG_DEMORGAN = 8) has no part. Normal-size gates in an 8-pixel
    // circuit are wired to ours instead (falstad-variants.test.ts).
    const { report } = importFalstad("150 256 160 352 160 8 2 0\nw 0 8 16 8 0\n");
    expect(report.unsupported.map((u) => u.code)).toEqual(["150"]);
  });
});
