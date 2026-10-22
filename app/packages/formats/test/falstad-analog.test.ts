// Multi-post analog parts: imported terminals must land exactly on the posts
// CircuitJS1 computes (TransistorElm, MosfetElm, OpAmpElm, TransformerElm setPoints()).
import { getDescriptor, terminalPositions } from "@cs/elements";
import { importFalstad } from "@cs/formats";

/** Import one element line; return its type, props, and terminal positions in Falstad pixels. */
function one(line: string) {
  const { doc, report } = importFalstad(`$ 1 5.0E-6 10 50 5.0 50\n${line}\n`);
  expect(report.unsupported).toEqual([]);
  const part = Object.values(doc.parts)[0];
  const posts = terminalPositions(part, getDescriptor(part.type)!).map((p) => [p.x * 16, p.y * 16]);
  return { part, posts, warnings: report.warnings.map((w) => w.message.key) };
}

describe("Falstad analog part placement", () => {
  test.each([
    ["NPN to the right", "t 304 240 352 240 0 1 0 0 100", "npn-transistor", [[304, 240], [352, 224], [352, 256]]],
    ["NPN to the left", "t 352 240 304 240 0 1 0 0 100", "npn-transistor", [[352, 240], [304, 224], [304, 256]]],
    ["NPN downward", "t 304 240 304 288 0 1 0 0 100", "npn-transistor", [[304, 240], [320, 288], [288, 288]]],
    ["NPN flipped", "t 304 240 352 240 1 1 0 0 100", "npn-transistor", [[304, 240], [352, 256], [352, 224]]],
    ["PNP to the right", "t 304 240 352 240 0 -1 0 0 100", "pnp-transistor", [[304, 240], [352, 256], [352, 224]]],
    ["NMOS", "f 304 240 352 240 0 1.5 0.02", "n-mosfet", [[304, 240], [352, 224], [352, 256]]],
    ["NMOS flipped", "f 304 240 352 240 8 1.5 0.02", "n-mosfet", [[304, 240], [352, 256], [352, 224]]],
    ["PMOS to the left", "f 352 240 304 240 1 1.5 0.02", "p-mosfet", [[352, 240], [304, 224], [304, 256]]],
    ["op-amp", "a 192 192 336 192 0", "op-amp", [[192, 176], [192, 208], [336, 192]]],
    ["op-amp, + on top", "a 192 192 336 192 1", "op-amp", [[192, 208], [192, 176], [336, 192]]],
    ["op-amp to the left", "a 336 192 192 192 0", "op-amp", [[336, 176], [336, 208], [192, 192]]],
    ["transformer", "T 272 192 352 192 0 100 1 0 0 0.999", "transformer", [[272, 192], [272, 224], [352, 192], [352, 224]]],
    ["vertical transformer", "T 272 192 272 272 8 4 2 0 0 0.99", "transformer", [[272, 192], [304, 192], [272, 272], [304, 272]]],
  ])("%s", (_name, line, type, expected) => {
    const { part, posts, warnings } = one(line);
    expect(part.type).toBe(type);
    expect(posts).toEqual(expected);
    expect(warnings).toEqual([]);
  });

  test("props come across", () => {
    expect(one("t 304 240 352 240 0 1 -4.3 0.7 150 default").part.props).toEqual({ beta: 150 });
    expect(one("f 304 240 352 240 0 2.5 0.05").part.props).toEqual({ threshold: 2.5, beta: 0.05 });
    expect(one("a 192 192 336 192 8 12 -12 1000000 0 0 2000").part.props).toEqual({ gain: 2000, maxOutput: 12, minOutput: -12 });
    expect(one("a 192 192 336 192 4").part.props.gain).toBe(1000);
    expect(one("z 192 272 192 208 0 6.2").part.props).toEqual({ zenerVoltage: 6.2 });
    expect(one("z 192 272 192 208 1 0.6 3.3").part.props).toEqual({ zenerVoltage: 3.3 });
    const t = one("T 272 192 352 192 4 100 0.5 0.01 0.02 0.98").part;
    expect(t.props).toEqual({ inductance: 100, ratio: 0.5, coupling: 0.98, reversePolarity: true });
    expect(t.savedState).toEqual([0.01, 0.02, 0, 0]);
  });

  test.each([
    ["short NPN", "t 304 240 336 240 0 1 0 0 100", [[304, 240], [336, 224], [336, 256]]],
    ["long NPN", "t 304 240 384 240 0 1 0 0 100", [[304, 240], [384, 224], [384, 256]]],
    ["long NMOS", "f 304 240 368 240 0 1.5 0.02", [[304, 240], [368, 224], [368, 256]]],
    ["short op-amp", "a 192 192 288 192 0", [[192, 176], [192, 208], [288, 192]]],
  ])("an off-size %s stretches to Falstad's posts without warnings", (_name, line, expected) => {
    const { posts, warnings } = one(line);
    expect(posts).toEqual(expected);
    expect(warnings).toEqual([]);
  });
});
