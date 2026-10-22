import { allDescriptors, localTerminals } from "@cs/elements";
import type { ColorToken, LiveReadouts, SymbolGraphics, TextStyle } from "@cs/elements";
import { getView } from "@cs/elements/views";
import type { Part } from "@cs/model";

class RecordingGraphics implements SymbolGraphics {
  ops: string[] = [];
  private finite(...n: number[]) {
    for (const v of n) if (!Number.isFinite(v)) throw new Error(`non-finite coordinate ${v}`);
  }
  beginPath() { this.ops.push("begin"); }
  moveTo(x: number, y: number) { this.finite(x, y); this.ops.push("move"); }
  lineTo(x: number, y: number) { this.finite(x, y); this.ops.push("line"); }
  arc(cx: number, cy: number, r: number, a0: number, a1: number) { this.finite(cx, cy, r, a0, a1); this.ops.push("arc"); }
  closePath() { this.ops.push("close"); }
  stroke(_c?: ColorToken, _w?: number) { this.ops.push("stroke"); }
  fill(_c?: ColorToken, _a?: number) { this.ops.push("fill"); }
  text(s: string, x: number, y: number, _st?: TextStyle) { this.finite(x, y); this.ops.push(`text:${s}`); }
}

const live: LiveReadouts = {
  get: (k) => ({ voltage: 1, current: 0.01, brightness: 0.5 })[k],
  terminalVoltages: [1, 0, 0.5],
};

describe("views", () => {
  for (const d of allDescriptors()) {
    const part: Part = {
      id: "p1",
      type: d.type,
      label: `${d.labelPrefix}1`,
      at: { x: 0, y: 0 },
      orientation: { rot: 0, flip: false },
      props: Object.fromEntries(d.props.map((p) => [p.key, p.default])),
    };

    it(`${d.type} draws, describes, and routes current between its terminals`, () => {
      const view = getView(d.type)!;
      for (const style of ["ansi", "iec", "lifelike"] as const) {
        const g = new RecordingGraphics();
        view.drawSymbol(g, part, style);
        expect(g.ops).toContain("stroke");
      }
      view.drawLive?.(new RecordingGraphics(), part, live);

      const terms = localTerminals(part, d);
      for (const path of view.currentPaths(part)) {
        expect(path.points[0]).toEqual(terms[path.from]);
        expect(path.points[path.points.length - 1]).toEqual(terms[path.to]);
      }
      const box = view.hitShape(part);
      expect(box.w).toBeGreaterThan(0);
      expect(box.h).toBeGreaterThan(0);

      const msg = view.describe(part, live);
      expect(msg.key).toBe(`element.${d.type}.describe`);
      expect(msg.values?.label).toBe(part.label);
    });
  }

  it("stretches with part.length", () => {
    const part: Part = { id: "p", type: "resistor", label: "R1", at: { x: 0, y: 0 }, orientation: { rot: 0, flip: false }, props: {}, length: 8 };
    expect(getView("resistor")!.currentPaths(part)[0].points[1]).toEqual({ x: 8, y: 0 });
    expect(getView("resistor")!.hitShape(part).w).toBe(8);
  });

  it("offers click controls on switches and the pot", () => {
    const p = (type: string): Part => ({ id: "p", type, label: "S1", at: { x: 0, y: 0 }, orientation: { rot: 0, flip: false }, props: {} });
    expect(getView("switch")!.controls!(p("switch"))[0].id).toBe("toggle");
    expect(getView("push-button")!.controls!(p("push-button"))[0].id).toBe("press");
    expect(getView("potentiometer")!.controls!(p("potentiometer"))[0].id).toBe("wiper");
    expect(getView("switch")!.describe({ ...p("switch"), props: { closed: true } }).values?.state).toBe("closed");
  });
});
