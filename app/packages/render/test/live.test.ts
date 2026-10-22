// @vitest-environment jsdom
import { allDescriptors, getDescriptor, localToDocument, terminalPositions } from "@cs/elements";
import { getView } from "@cs/elements/views";
import { createDocument, type CompiledCircuit, type Part } from "@cs/model";
import { chargeMarks, gradientStops, logicColor, logicOfVoltage, powerColor } from "../src/live-colors";
import { LiveEffects } from "../src/live-effects";
import { candidates, overlaps, placeLabels, type LabelRequest } from "../src/label-placement";
import { findWireCrossings } from "../src/crossings";
import { SvgSymbolGraphics } from "../src/svg-graphics";
import { schematicToSvg } from "../src/svg-graphics-export";
import { affineFrom } from "../src/canvas-graphics";
import { invertAffine } from "../src/live-layer";
import { darkTheme, lightTheme, voltageColor } from "../src/theme";
import type { ElementAccess } from "../src/schematic";

const access: ElementAccess = { getView, getDescriptor, terminalPositions, localToDocument };

const part = (type: string, props: Part["props"] = {}): Part => {
  const d = getDescriptor(type)!;
  return {
    id: "p1",
    type,
    label: `${d.labelPrefix}1`,
    at: { x: 2, y: 3 },
    orientation: { rot: 90, flip: true },
    props: { ...Object.fromEntries(d.props.map((p) => [p.key, p.default])), ...props },
  };
};

const wellFormed = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml").getElementsByTagName("parsererror").length === 0;

describe("live colors (ANI-13, ANI-16, ANI-18, ANI-22)", () => {
  it("shades a part from one terminal's voltage color to the other's", () => {
    const stops = gradientStops(lightTheme, 10, 0, 10)!;
    expect(stops[0]).toBe(voltageColor(lightTheme, 10, 10));
    expect(stops[1]).toBe(voltageColor(lightTheme, 0, 10));
    expect(stops[0]).not.toBe(stops[1]);
    expect(gradientStops(lightTheme, 5, 5.01, 10)).toBeUndefined(); // no visible drop
    expect(gradientStops(lightTheme, 1, 0, 0)).toBeUndefined();
  });

  it("glows warm for absorbing parts and cool for delivering ones, scaled to the largest power", () => {
    const hot = powerColor(1, 1)!;
    const warm = powerColor(0.1, 1)!;
    const src = powerColor(-1, 1)!;
    expect(hot.absorbing).toBe(true);
    expect(src.absorbing).toBe(false);
    expect(hot.color).toBe("rgb(245,124,0)");
    expect(src.color).toBe("rgb(30,136,229)");
    expect(warm.alpha).toBeLessThan(hot.alpha);
    expect(powerColor(0.001, 1)).toBeUndefined();
  });

  it("colors logic levels and counts charge marks", () => {
    expect(logicOfVoltage(5)).toBe(1);
    expect(logicOfVoltage(0.2)).toBe(0);
    expect(logicOfVoltage(2.5)).toBe("x");
    expect(logicColor(lightTheme, 1)).not.toBe(logicColor(lightTheme, 0));
    expect(logicColor(darkTheme, "x")).toBe("#ff6e6e");
    expect(chargeMarks(0)).toBe(0);
    expect(chargeMarks(0.5)).toBe(3);
    expect(chargeMarks(2)).toBe(5);
  });
});

describe("LiveEffects (ANI-17, RLM-05)", () => {
  // One lamp (3 W at 6 V, 12 Ω) and one red LED, on hand-made display states.
  const doc = createDocument({
    settings: { realisticParts: false, realisticRatings: true, start: "zero", seed: 1 },
    parts: { L1: part("lamp"), D1: part("led"), R1: part("resistor") },
  });
  doc.parts.L1.id = "L1";
  doc.parts.D1.id = "D1";
  doc.parts.R1.id = "R1";
  const compiled = {
    netlist: {
      nodeCount: 2,
      nodeNames: ["GND", "N1", "N2"],
      elements: [
        { id: "L1", type: "lamp", nodes: [1, 0], props: {} },
        { id: "D1", type: "led", nodes: [2, 0], props: {} },
        { id: "R1", type: "resistor", nodes: [1, 2], props: {} },
      ],
      settings: doc.settings,
    },
  } as unknown as CompiledCircuit;
  // display: [gnd, V1, V2, L1.i0, L1.i1, D1.i0, D1.i1, R1.i0, R1.i1]
  const display = (vLamp: number, iLed: number, iR = 0) => Float64Array.from([0, vLamp, 2, vLamp / 12, -vLamp / 12, iLed, -iLed, iR, -iR]);

  it("a lamp's glow lags its power like a filament; an LED follows its current", () => {
    const fx = new LiveEffects();
    fx.build(doc, compiled);
    fx.update(display(0, 0), 0, 0);
    fx.update(display(6, 0.02), 0, 0.01); // switched on: 10 ms later
    const early = fx.get("L1")!.brightness;
    fx.update(display(6, 0.02), 0, 1);
    const late = fx.get("L1")!.brightness;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(late);
    expect(late).toBeCloseTo(1, 3);
    expect(fx.get("D1")!.brightness).toBeCloseTo(1, 6);
    expect(fx.readout("L1", "power")).toBeCloseTo(3, 6);
  });

  it("mirrors the heating behind the warning badge and quotes the worst rating", () => {
    const fx = new LiveEffects();
    fx.build(doc, compiled);
    fx.update(display(6, 0, 0.04), 0, 0); // R1: 4 V × 40 mA = 0.16 W, under 0.25 W
    expect(fx.get("R1")!.stress).toBeCloseTo(0.64, 6);
    fx.update(display(6, 0, 0.1), 0, 0.001); // 0.4 W
    fx.update(display(6, 0, 0.1), 0, 1.001);
    const v = fx.get("R1")!;
    expect(v.stress).toBeCloseTo(1.6, 6);
    expect(v.worst?.value).toBeCloseTo(0.4, 6);
    expect(v.worst?.rating).toBe(0.25);
    expect(v.heat).toBeGreaterThan(0.25);
    expect(v.heat).toBeLessThan(1);
  });
});

describe("label placement (rendering.md §2.4)", () => {
  it("never overlaps symbols, wires or other labels when a free spot exists", () => {
    const symbols = [
      { x: 0, y: 0, w: 60, h: 30 },
      { x: 0, y: -40, w: 60, h: 30 }, // directly above the first: "above" is taken
      { x: 100, y: 0, w: 60, h: 30 },
    ];
    const wires = [{ x: 60, y: 13, w: 40, h: 4 }];
    const reqs: LabelRequest[] = symbols.map((box, i) => ({ id: `p${i}`, box, lines: ["R1", "10 kΩ"], widths: [20, 40], lineHeight: 12 }));
    const out = placeLabels(reqs, [...symbols, ...wires]);
    for (const p of out) {
      expect(p.hidden).toBe(false);
      for (const o of [...symbols, ...wires]) expect(overlaps(p.box, o)).toBe(false);
      for (const q of out) if (q !== p) expect(overlaps(p.box, q.box)).toBe(false);
    }
    // The first part's preferred spot (above) was blocked, so it went below.
    expect(out[0].box.y).toBeGreaterThan(30);
  });

  it("hides a label with nowhere to go, and honours a dragged position", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    const wall = candidates(box, 30, 12);
    const out = placeLabels([{ id: "a", box, lines: ["R1"], widths: [30], lineHeight: 12 }], wall);
    expect(out[0].hidden).toBe(true);
    const fixed = placeLabels([{ id: "a", box, lines: ["R1"], widths: [30], lineHeight: 12, fixed: { x: 100, y: 100 } }], wall);
    expect(fixed[0].hidden).toBe(false);
    expect(fixed[0].box.x).toBe(85);
  });
});

describe("crossings (CAN-10)", () => {
  it("finds wires that cross without a junction, but not ones that meet", () => {
    const wires = [
      { id: "h", points: [{ x: 0, y: 5 }, { x: 10, y: 5 }] },
      { id: "v", points: [{ x: 5, y: 0 }, { x: 5, y: 10 }] },
      { id: "t", points: [{ x: 8, y: 5 }, { x: 8, y: 10 }] }, // a tee: ends on h
    ];
    const c = findWireCrossings(wires);
    expect(c).toHaveLength(1);
    expect(c[0].at).toEqual({ x: 5, y: 5 });
    expect(c[0].under.wire).toBe("v");
  });
});

describe("SVG graphics and export (FIL-11)", () => {
  it("writes arcs and full circles as SVG path data", () => {
    const g = new SvgSymbolGraphics(lightTheme);
    g.beginPath();
    g.arc(0, 0, 1, 0, 2 * Math.PI);
    g.closePath();
    g.stroke("symbol");
    g.beginPath();
    g.moveTo(-1, 0);
    g.arc(0, 0, 1, Math.PI, 0); // upper half, clockwise on screen
    g.stroke();
    expect(g.out[0]).toMatch(/^<path d="M1 0A1 1 0 0 1 -1 0A1 1 0 0 1 1 0Z"/);
    expect(g.out[1]).toContain("M-1 0L-1 0A1 1 0 0 1 1 0");
  });

  it("every part type draws in every style without throwing, as well-formed SVG", () => {
    for (const d of allDescriptors()) {
      for (const style of ["ansi", "iec", "lifelike"] as const) {
        const p = part(d.type);
        const g = new SvgSymbolGraphics(lightTheme);
        g.setFrame(affineFrom((q) => localToDocument(p, q)));
        getView(d.type)!.drawSymbol(g, p, style);
        g.text("x&y", 0, 0);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg">${g.out.join("")}${g.texts.join("")}</svg>`;
        expect(wellFormed(svg), `${d.type} ${style}`).toBe(true);
      }
    }
  });

  it("exports a whole circuit with wires, symbols, labels, junctions and failure damage", () => {
    const doc = createDocument({
      meta: { title: "R & C <test>", description: "" },
      parts: {
        R1: { ...part("resistor", { resistance: 4700, failed: "open" }), id: "R1", at: { x: 0, y: 0 }, orientation: { rot: 0, flip: false } },
        C1: { ...part("capacitor"), id: "C1", label: "C1", at: { x: 4, y: 0 }, orientation: { rot: 90, flip: false } },
      },
      wires: {
        w1: { id: "w1", points: [{ x: 4, y: 0 }, { x: 8, y: 0 }] },
        w2: { id: "w2", points: [{ x: 4, y: 0 }, { x: 4, y: -3 }] },
      },
    });
    for (const style of ["ansi", "iec", "lifelike"] as const) {
      const svg = schematicToSvg(doc, access, lightTheme, { style });
      expect(wellFormed(svg)).toBe(true);
      expect(svg).toContain(">R1<");
      expect(svg).toContain(">4.7 kΩ<");
      expect(svg).toContain("<circle"); // junction at (4, 0)
      expect(svg).toContain("&lt;test&gt;");
    }
    expect(schematicToSvg(doc, access, lightTheme, { style: "lifelike" })).toContain("#fdd835"); // yellow band of 4.7 kΩ
  });

  it("inverts a part's frame for gradient coordinates", () => {
    const m = affineFrom((q) => ({ x: -q.y * 20 + 7, y: q.x * 20 + 3 }));
    const inv = invertAffine(m);
    const p = { x: 2, y: -1 };
    const s = { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
    expect(inv[0] * s.x + inv[2] * s.y + inv[4]).toBeCloseTo(2, 12);
    expect(inv[1] * s.x + inv[3] * s.y + inv[5]).toBeCloseTo(-1, 12);
  });
});
