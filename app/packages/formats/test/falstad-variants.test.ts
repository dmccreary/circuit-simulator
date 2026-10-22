// Falstad elements our parts match only after rewiring (mapping-variants.ts):
// full-size elements in an 8-pixel circuit and flipped chips. Each Falstad
// post gets a labeled node; the imported part's terminals must land on exactly
// those nets, in order.
import { createPartResolver, getDescriptor, terminalPositions } from "@cs/elements";
import { importFalstad } from "@cs/formats";
import { compile } from "@cs/model";

const HEADER = "$ 1 5.0E-6 10 50 5.0 50\n";
/** An off-16 wire far away makes the importer choose the 8-pixel grid; the ground fixes the reference node. */
const SMALL_GRID = "w -800 -792 -784 -792 0\ng -800 -792 -800 -776 0\n";
const GROUND16 = "g -800 -800 -800 -784 0\n";

/** Our terminal positions, in Falstad pixels, for a line imported on the 16-pixel grid (Falstad's posts). */
function posts16(line: string): number[][] {
  const { doc, report } = importFalstad(`${HEADER}${line}\n`);
  expect(report.unsupported).toEqual([]);
  expect(report.gridPixels).toBe(16);
  const part = Object.values(doc.parts)[0];
  return terminalPositions(part, getDescriptor(part.type)!).map((p) => [p.x * 16, p.y * 16]);
}

/** Import `line` with a label on each post; return the nets of the part's terminals by label. */
function netsAt(line: string, posts: number[][], grid = SMALL_GRID) {
  const labels = posts.map(([x, y], i) => `207 ${x} ${y} ${x} ${y} 4 P${i}`).join("\n");
  const { doc, report } = importFalstad(`${HEADER}${line}\n${labels}\n${grid}`);
  expect(report.unsupported).toEqual([]);
  const c = compile(doc, createPartResolver());
  expect(c.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const nl = c.netlist;
  const el = nl.elements.find((e) => e.type !== "ground")!;
  return { type: el.type, props: el.props, nets: el.nodes.map((n) => nl.nodeNames[n]), gridPixels: report.gridPixels };
}

describe("full-size Falstad elements in an 8-pixel circuit", () => {
  test.each([
    ["2-input AND", "150 256 160 352 160 0 2 0", "and-gate"],
    ["3-input XOR, upward", "154 256 352 256 224 0 3 0", "xor-gate-3"],
    ["7-input XOR", "154 288 368 416 368 0 7 0 5", "xor-gate-7"],
    ["5-input NAND, leftward", "151 416 160 288 160 0 5 0", "nand-gate-5"],
    ["op-amp", "a 272 176 384 176 8 15 -15 1000000 0 0 100000", "op-amp"],
    ["op-amp, inputs swapped, leftward", "a 384 256 272 256 9 10 0 1000000 0 0 100000", "op-amp"],
    ["npn transistor, leftward", "t 336 368 288 368 0 1 0 0 100", "npn-transistor"],
    ["pnp transistor, flipped, down", "t 128 96 128 160 1 -1 0 0 100", "pnp-transistor"],
    ["n-MOSFET, upward", "f 384 80 384 16 4 1.5 0.02", "n-mosfet"],
    ["analog switch", "159 288 352 352 352 0 20 1e10 2.5", "analog-switch"],
    ["analog changeover, inverted, leftward", "160 320 192 256 192 1 20 1e10 2.5", "analog-switch-2"],
    ["JK flip-flop", "156 80 272 128 272 0 5", "jk-flip-flop"],
    ["555 timer", "165 96 208 160 208 4 0", "timer-555"],
    ["seven-segment display", "157 880 224 1008 224 0 7 0 0", "seven-segment"],
    ["4-bit decimal display", "419 592 64 672 64 0 4", "number-display"],
    ["current conveyor", "179 240 256 272 256 0 1.0", "current-conveyor"],
  ])("%s", (_name, line, type) => {
    const posts = posts16(line);
    const n = type === "number-display" ? 4 : posts.length;
    const got = netsAt(line, posts.slice(0, n));
    expect(got.gridPixels).toBe(8);
    expect(got.type).toBe(type);
    expect(got.nets.slice(0, n)).toEqual(posts.slice(0, n).map((_, i) => `P${i}`));
  });

  test("D flip-flop with reset: Falstad's Q̄ (E2) and R (W2) reach ours", () => {
    // DFlipFlopElm 2×3, cspc2 = 32: D W0, CLK W1, Q E0, Q̄ E2, R W2. Ours: D, CLK, Q, Q̄, S, R.
    const got = netsAt("155 96 64 128 64 2 0", [[96, 64], [96, 96], [192, 64], [192, 128], [96, 128]]);
    expect(got.type).toBe("d-flip-flop");
    expect([...got.nets.slice(0, 4), got.nets[5]]).toEqual(["P0", "P1", "P2", "P3", "P4"]);
    expect(got.nets[4]).not.toMatch(/^P/);
  });

  test("a gate too short for its wires stays a placeholder", () => {
    const { report } = importFalstad(`${HEADER}150 256 160 272 160 0 2 0\n${SMALL_GRID}`);
    expect(report.unsupported.map((u) => u.code)).toEqual(["150"]);
  });
});

describe("flipped Falstad chips", () => {
  test("current conveyor flipped left-right (FLAG_FLIP_X): X and Y on the right, Z on the left", () => {
    // CC2Elm 2×3 chip, cspc2 = 32: X at W0, Y at W2, Z at E1, mirrored about the chip's centre.
    const got = netsAt("179 240 256 272 256 1024 -1.0", [[336, 256], [336, 320], [240, 288]], GROUND16);
    expect(got).toMatchObject({ type: "current-conveyor", nets: ["P0", "P1", "P2"], gridPixels: 16 });
  });

  test("seven-segment display flipped left-right", () => {
    // SevenSegElm 4×4: a-d at W0-W3 move to the east side, e-g at S1-S3 run right to left.
    const x = 912;
    const y = 32;
    const posts = [[x + 160, y], [x + 160, y + 32], [x + 160, y + 64], [x + 160, y + 96], [x + 96, y + 128], [x + 64, y + 128], [x + 32, y + 128]];
    const got = netsAt(`157 ${x} ${y} ${x + 80} ${y} 1024 7 0 0`, posts, GROUND16);
    expect(got).toMatchObject({ type: "seven-segment", nets: posts.map((_, i) => `P${i}`) });
  });

  test("decimal display flipped top-bottom (FLAG_FLIP_Y): the MSB input moves to the bottom", () => {
    const got = netsAt("419 592 64 672 64 2048 3", [[592, 128], [592, 96], [592, 64]], GROUND16);
    expect(got.nets.slice(0, 3)).toEqual(["P0", "P1", "P2"]);
  });
});

describe("flip-flop options", () => {
  test("JK flip-flops trigger on the falling edge unless FLAG_POSITIVE_EDGE", () => {
    expect(netsAt("156 128 240 144 240 0 0 0", posts16("156 128 240 144 240 0 0 0"), GROUND16).props).toMatchObject({ fallingEdge: true });
    expect(netsAt("156 128 240 144 240 4 0 0", posts16("156 128 240 144 240 4 0 0"), GROUND16).props).toMatchObject({ fallingEdge: false });
  });

  test("D flip-flop FLAG_INVERT_SET_RESET makes reset active-low", () => {
    const { doc, report } = importFalstad(`${HEADER}155 1184 320 1232 320 10 0\n`);
    expect(report.unsupported).toEqual([]);
    expect(Object.values(doc.parts)[0].props).toMatchObject({ invertSetReset: true });
  });
});
