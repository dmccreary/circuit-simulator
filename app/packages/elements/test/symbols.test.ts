import { allDescriptors, colorBands } from "@cs/elements";
import type { ColorToken, SymbolGraphics, TextStyle } from "@cs/elements";
import { getView } from "@cs/elements/views";
import type { Part } from "@cs/model";
import type { RichGraphics } from "../src/shared/graphics-ext";
import { hasStyle } from "../src/shared/symbol-styles";
import { defaultPropsFor, realisticChanges } from "../src/shared/realistic";
import { getDescriptor } from "@cs/elements";

/** Records ops; `rich` adds the raw-color extension the canvas and SVG provide. */
class Rec implements SymbolGraphics {
  ops: string[] = [];
  beginPath() { this.ops.push("begin"); }
  moveTo(x: number, y: number) { this.check(x, y); this.ops.push(`M${x.toFixed(2)},${y.toFixed(2)}`); }
  lineTo(x: number, y: number) { this.check(x, y); this.ops.push(`L${x.toFixed(2)},${y.toFixed(2)}`); }
  arc(cx: number, cy: number, r: number, a0: number, a1: number) { this.check(cx, cy, r, a0, a1); this.ops.push("arc"); }
  closePath() { this.ops.push("close"); }
  stroke(c?: ColorToken) { this.ops.push(`stroke:${c ?? ""}`); }
  fill(c?: ColorToken) { this.ops.push(`fill:${c ?? ""}`); }
  text(s: string, x: number, y: number, _st?: TextStyle) { this.check(x, y); this.ops.push(`text:${s}`); }
  protected check(...n: number[]) { for (const v of n) if (!Number.isFinite(v)) throw new Error(`non-finite ${v}`); }
}
class RichRec extends Rec implements RichGraphics {
  readonly rich = true as const;
  strokeCss(css: string) { this.ops.push(`strokeCss:${css}`); }
  fillCss(css: string) { this.ops.push(`fillCss:${css}`); }
}

const partOf = (type: string, props: Part["props"] = {}): Part => {
  const d = getDescriptor(type)!;
  return {
    id: "p1",
    type,
    label: "X1",
    at: { x: 0, y: 0 },
    orientation: { rot: 0, flip: false },
    props: { ...Object.fromEntries(d.props.map((p) => [p.key, p.default])), ...props },
  };
};

describe("resistor color code (CAN-14)", () => {
  it.each([
    [4700, ["yellow", "violet", "red", "gold"]],
    [1000, ["brown", "black", "red", "gold"]],
    [10, ["brown", "black", "black", "gold"]],
    [220, ["red", "red", "brown", "gold"]],
    [4.7, ["yellow", "violet", "gold", "gold"]],
    [0.47, ["yellow", "violet", "silver", "gold"]],
    [1e6, ["brown", "black", "green", "gold"]],
    [360, ["orange", "blue", "brown", "gold"]],
    [999, ["brown", "black", "red", "gold"]], // rounds up to 1.0 kΩ
  ])("%s Ω → %j", (ohms, bands) => {
    expect(colorBands(ohms)).toEqual(bands);
  });
});

describe("symbol styles (CAN-07, CAN-14)", () => {
  it("IEC draws a rectangle resistor, lifelike draws the color bands", () => {
    const view = getView("resistor")!;
    const p = partOf("resistor", { resistance: 4700 });
    const ansi = new RichRec();
    const iec = new RichRec();
    const life = new RichRec();
    view.drawSymbol(ansi, p, "ansi");
    view.drawSymbol(iec, p, "iec");
    view.drawSymbol(life, p, "lifelike");
    expect(iec.ops).not.toEqual(ansi.ops);
    expect(life.ops).toContain("fillCss:#fdd835"); // yellow
    expect(life.ops).toContain("fillCss:#7b1fa2"); // violet
    expect(life.ops).toContain("fillCss:#d32f2f"); // red
  });

  it("IEC logic gates are rectangles with their qualifying symbol", () => {
    const and = new Rec();
    getView("and-gate")!.drawSymbol(and, partOf("and-gate"), "iec");
    expect(and.ops).toContain("text:&");
    const nor = new Rec();
    getView("nor-gate-3")!.drawSymbol(nor, partOf("nor-gate-3"), "iec");
    expect(nor.ops).toContain("text:≥1");
    const not = new Rec();
    getView("not-gate")!.drawSymbol(not, partOf("not-gate"), "iec");
    expect(not.ops).toContain("text:1");
    expect(hasStyle("op-amp", "iec")).toBe(true);
    expect(hasStyle("resistor", "lifelike")).toBe(true);
  });

  it("every part type draws in every style, with plain and raw-color graphics", () => {
    for (const d of allDescriptors()) {
      for (const style of ["ansi", "iec", "lifelike"] as const) {
        for (const g of [new Rec(), new RichRec()]) {
          getView(d.type)!.drawSymbol(g, partOf(d.type), style);
          expect(g.ops.some((o) => o.startsWith("stroke")), `${d.type} ${style}`).toBe(true);
        }
      }
    }
  });

  it("failed parts are drawn damaged (RLM-06)", () => {
    const view = getView("resistor")!;
    const ok = new RichRec();
    const open = new RichRec();
    const short = new RichRec();
    view.drawSymbol(ok, partOf("resistor"), "ansi");
    view.drawSymbol(open, partOf("resistor", { failed: "open" }), "ansi");
    view.drawSymbol(short, partOf("resistor", { failed: "short" }), "ansi");
    expect(ok.ops.some((o) => o.startsWith("fillCss"))).toBe(false);
    expect(open.ops).toContain("fillCss:#3e2723"); // soot
    expect(open.ops).toContain("strokeCss:#ffffff"); // crack
    expect(short.ops).toContain("strokeCss:#5d4037"); // melted bridge
  });

  it("capacitors show charge marks on the charged plates (ANI-18)", () => {
    const g = new Rec();
    getView("capacitor")!.drawLive!(g, partOf("capacitor"), { get: (k) => (k === "chargeLevel" ? 0.5 : undefined), terminalVoltages: [5, 0] });
    expect(g.ops.filter((o) => o === "stroke:charge.plus")).toHaveLength(1);
    expect(g.ops.filter((o) => o === "stroke:charge.minus")).toHaveLength(1);
    // Three marks per plate: "+" is two strokes' worth of moves, "−" one.
    expect(g.ops.filter((o) => o.startsWith("M"))).toHaveLength(9);
  });
});

describe("realistic defaults (RLM-01)", () => {
  it("are declared for battery, sources, switches, meters and the op-amp", () => {
    expect(defaultPropsFor(getDescriptor("battery")!, true).internalResistance).toBe(0.5);
    expect(defaultPropsFor(getDescriptor("switch")!, true).onResistance).toBe(0.05);
    expect(defaultPropsFor(getDescriptor("voltmeter")!, true).inputResistance).toBe(10e6);
    expect(defaultPropsFor(getDescriptor("op-amp")!, true)).toMatchObject({ maxOutput: 13.5, minOutput: -13.5, outputResistance: 75 });
    expect(realisticChanges(getDescriptor("battery")!, { voltage: 9, internalResistance: 2 }, true)).toEqual({});
  });
});
