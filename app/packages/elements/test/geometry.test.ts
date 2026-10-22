import { allDescriptors, createPartResolver, getDescriptor, localToDocument, terminalPositions } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { getView } from "@cs/elements/views";
import type { Part, Rotation } from "@cs/model";

function part(type: string, rot: Rotation, flip: boolean, extra: Partial<Part> = {}): Part {
  return { id: "p1", type, label: "X1", at: { x: 10, y: 20 }, orientation: { rot, flip }, props: {}, ...extra };
}

describe("localToDocument", () => {
  const p = { x: 3, y: 1 };
  it.each([
    [0, false, { x: 13, y: 21 }],
    [90, false, { x: 9, y: 23 }],
    [180, false, { x: 7, y: 19 }],
    [270, false, { x: 11, y: 17 }],
    [0, true, { x: 13, y: 19 }],
    [90, true, { x: 11, y: 23 }],
    [180, true, { x: 7, y: 21 }],
    [270, true, { x: 9, y: 17 }],
  ] as const)("rot %d flip %s", (rot, flip, expected) => {
    expect(localToDocument(part("resistor", rot, flip), p)).toEqual(expected);
  });

  it("never produces -0", () => {
    const q = localToDocument({ ...part("resistor", 180, false), at: { x: 0, y: 0 } }, { x: 0, y: 0 });
    expect(Object.is(q.x, -0) || Object.is(q.y, -0)).toBe(false);
  });
});

describe("terminalPositions", () => {
  const d = getDescriptor("resistor")!;
  it.each([
    [0, { x: 14, y: 20 }],
    [90, { x: 10, y: 24 }],
    [180, { x: 6, y: 20 }],
    [270, { x: 10, y: 16 }],
  ] as const)("two-terminal part, rot %d", (rot, t1) => {
    expect(terminalPositions(part("resistor", rot, false), d)).toEqual([{ x: 10, y: 20 }, t1]);
  });

  it("uses part.length for stretchable parts", () => {
    expect(terminalPositions(part("resistor", 0, false, { length: 7 }), d)[1]).toEqual({ x: 17, y: 20 });
  });

  it("flips the potentiometer wiper to the other side", () => {
    const pot = getDescriptor("potentiometer")!;
    expect(terminalPositions(part("potentiometer", 0, false), pot)[2]).toEqual({ x: 12, y: 18 });
    expect(terminalPositions(part("potentiometer", 0, true), pot)[2]).toEqual({ x: 12, y: 22 });
    expect(terminalPositions(part("potentiometer", 90, false), pot)[2]).toEqual({ x: 12, y: 22 });
  });
});

describe("registry", () => {
  const all = allDescriptors();

  it("has unique types and both halves for every part", () => {
    expect(new Set(all.map((d) => d.type)).size).toBe(all.length);
    for (const d of all) {
      expect(getView(d.type), d.type).toBeDefined();
      if (d.type !== "ground") expect(getModelFactory(d.type), d.type).toBeDefined();
    }
    expect(getModelFactory("ground")).toBeUndefined();
    expect(getDescriptor("nope")).toBeUndefined();
    expect(getModelFactory("toString")).toBeUndefined();
  });

  it("keeps numeric defaults inside their ranges", () => {
    for (const d of all) {
      for (const p of d.props) {
        if ((p.kind ?? "number") !== "number") continue;
        expect(typeof p.default, `${d.type}.${p.key}`).toBe("number");
        if (p.range) {
          expect(p.default as number).toBeGreaterThanOrEqual(p.range[0]);
          expect(p.default as number).toBeLessThanOrEqual(p.range[1]);
        }
      }
      if (d.stretchable) expect(d.terminals[1].at).toEqual({ x: d.stretchable.default, y: 0 });
      expect(d.terminals[0].at).toEqual({ x: 0, y: 0 });
    }
  });

  it("covers the Essentials list", () => {
    const essentials = all.filter((d) => d.essentials).map((d) => d.type);
    for (const t of ["ground", "battery", "dc-source", "ac-source", "resistor", "potentiometer", "capacitor", "inductor",
      "switch", "push-button", "lamp", "led", "diode", "voltmeter", "ammeter"]) {
      expect(essentials).toContain(t);
    }
  });
});

describe("createPartResolver", () => {
  const r = createPartResolver();

  it("maps traits", () => {
    expect(r.traits("ground")).toMatchObject({ known: true, netName: "GND" });
    expect(r.traits("battery")).toMatchObject({ known: true, voltageSource: true });
    expect(r.traits("current-source").currentSource).toBe(true);
    expect(r.traits("ammeter").ammeter).toBe(true);
    expect(r.traits("voltmeter").voltmeter).toBe(true);
    expect(r.traits("falstad:placeholder")).toEqual({ known: false });
  });

  it("shorts closed ideal switches only", () => {
    const sw = r.traits("switch").shorts!;
    expect(sw({ closed: true })).toEqual([[0, 1]]);
    expect(sw({ closed: false })).toEqual([]);
    expect(sw({ closed: true, onResistance: 1 })).toEqual([]);
    const pb = r.traits("push-button").shorts!;
    expect(pb({ pressed: true })).toEqual([[0, 1]]);
    expect(pb({ pressed: false, normallyClosed: true })).toEqual([[0, 1]]);
    expect(pb({ pressed: true, normallyClosed: true })).toEqual([]);
    expect(r.traits("resistor").shorts).toBeUndefined();
  });

  it("returns document terminal positions", () => {
    expect(r.terminals(part("battery", 90, false))).toEqual([{ x: 10, y: 20 }, { x: 10, y: 24 }]);
    expect(r.terminals(part("ground", 0, false))).toEqual([{ x: 10, y: 20 }]);
    expect(r.terminals(part("unknown", 0, false))).toEqual([]);
  });
});
