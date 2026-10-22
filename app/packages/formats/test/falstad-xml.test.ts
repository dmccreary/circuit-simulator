// Falstad's XML format (<cir ...>) reads into the same FalstadCircuit as the
// text format and imports through the same mapper.
import { importFalstad, isFalstadXml, parseFalstadText, parseFalstadXml, parseXml, XmlError } from "@cs/formats";

describe("XML reader", () => {
  test("elements, attributes, entities, text, comments, and CDATA", () => {
    const root = parseXml(
      `<?xml version="1.0"?>\n<!-- c --><a x='1' y="&lt;&amp;&#65;&#x42;">t<b/><c k="v">u<![CDATA[<raw>]]></c></a>`,
    );
    expect(root.tag).toBe("a");
    expect(root.attrs).toEqual({ x: "1", y: "<&AB" });
    expect(root.text).toBe("t");
    expect(root.children.map((c) => c.tag)).toEqual(["b", "c"]);
    expect(root.children[1].text).toBe("u<raw>");
    expect(root.line).toBe(2);
  });

  test.each([
    ["<a><b></a>", "unexpected </a>"],
    ["<a>", "not closed"],
    ["<a x=1/>", "unquoted"],
    ["<a/><b/>", "more than one root"],
  ])("rejects %s", (src, msg) => {
    expect(() => parseXml(src)).toThrow(XmlError);
    expect(() => parseXml(src)).toThrow(msg);
  });
});

const XML = `<cir f="1" ts="0.000005" ic="10.2" cb="58" pb="50" vr="5" mts="5e-11">
  <v x="112 368 112 48" f="0" wf="1" fr="60" maxv="5" bias="0" phaseShift="0" dutyCycle="0.5"/>
  <r x="112 48 240 48" f="0" r="10000"/>
  <c x="240 48 240 368" f="0" c="0.000001" iv="0" vd="0.5"/>
  <w x="112 368 240 368" f="0"/>
  <rw x="240 48 400 112" f="0">240,48;400,48;400,112</rw>
  <g x="240 368 240 400" f="0"/>
  <LED x="400 112 400 176" f="0" cr="0" cg="1" cb="0"/>
  <ln x="400 176 400 240" f="4" te="out &amp; more"/>
  <a x="192 192 336 192" f="0" ma="12" mi="-12" ga="2000"/>
  <x x="64 0 128 16" f="4" si="24" te="Hello world"/>
  <Bogus x="0 0 16 0" f="0" q="1"/>
  <o en="2" sp="64" f="x2" p="0"><p v="0" sc="5"/></o>
  <adj e="1" ei="0" en="Resistance" mn="100" mx="20000" st="R" log="1"/>
  <h t="2" i1="1" i2="2"/>
  <dm nm="test" f="0"/>
</cir>`;

describe("Falstad XML", () => {
  test("is detected by its root element", () => {
    expect(isFalstadXml(XML)).toBe(true);
    expect(isFalstadXml(`﻿<?xml version="1.0"?>\n<cir f="0"/>`)).toBe(true);
    expect(isFalstadXml("$ 1 5e-6 10 50 5\nr 0 0 64 0 0 100")).toBe(false);
  });

  test("reads settings, elements in text-token order, scopes, sliders, hints, and models", () => {
    const fc = parseFalstadXml(XML);
    expect(fc.settings).toMatchObject({ flags: 1, timeStep: 5e-6, currentSpeed: 58, voltageRange: 5, powerBar: 50, minTimeStep: 5e-11 });
    expect(fc.settings!.speed).toBe(Math.floor(Math.log(102) * 24 + 61.5));
    expect(fc.elements.map((e) => e.code)).toEqual(["v", "r", "c", "w", "w", "g", "162", "207", "a", "x", "Bogus"]);
    // Same params as the text line "v 112 368 112 48 0 1 60 5 0 0 0.5".
    const text = parseFalstadText("v 112 368 112 48 0 1 60 5 0 0 0.5").elements[0];
    expect(fc.elements[0]).toMatchObject({ x1: text.x1, y1: text.y1, x2: text.x2, y2: text.y2, flags: text.flags, params: text.params.map(String) });
    expect(fc.elements[2].params).toEqual(["0.000001", "0.5", "0"]);
    expect(fc.elements[4].route).toEqual([[240, 48], [400, 48], [400, 112]]);
    expect(fc.elements[8].flags & 8).toBe(8); // gain present -> FLAG_GAIN
    expect(fc.elements[8].params[5]).toBe("2000");
    expect(fc.elements[9].flags & 4).toBe(0); // text already unescaped
    expect(fc.scopes).toEqual([expect.objectContaining({ element: 2, speed: 64, value: 0, flags: 2 })]);
    expect(fc.sliders).toEqual([expect.objectContaining({ element: 1, editItem: 0, min: 100, max: 20000, flags: 2, text: "R" })]);
    expect(fc.hints).toEqual([{ type: 2, item1: 1, item2: 2 }]);
    expect(fc.models).toHaveLength(1);
  });

  test("imports through the shared mapper", () => {
    const { doc, report } = importFalstad(XML);
    const types = Object.values(doc.parts).map((p) => p.type).sort();
    expect(types).toEqual(["ac-source", "capacitor", "falstad:placeholder", "ground", "led", "op-amp", "resistor"]);
    expect(report.unsupported.map((u) => u.code)).toEqual(["Bogus"]);
    const r = Object.values(doc.parts).find((p) => p.type === "resistor")!;
    expect(r.props.resistance).toBe(10000);
    expect(Object.values(doc.parts).find((p) => p.type === "op-amp")!.props).toEqual({ gain: 2000, maxOutput: 12, minOutput: -12 });
    expect(Object.values(doc.parts).find((p) => p.type === "led")!.props.color).toBe("green");
    // The routed wire keeps its route; the labeled node becomes a lead wire and a net label.
    const points = Object.values(doc.wires).map((w) => w.points.map((p) => `${p.x},${p.y}`).join(" "));
    expect(points).toContain("15,3 25,3");
    expect(points).toContain("25,3 25,7");
    expect(Object.values(doc.netLabels)).toEqual([expect.objectContaining({ name: "out & more", at: { x: 25, y: 15 } })]);
    expect(Object.values(doc.annotations)[0].text).toBe("Hello world");
    expect(Object.values(doc.sliders)[0]).toMatchObject({ prop: "resistance", min: 100, max: 20000, log: true });
    expect(Object.keys(doc.probes)).toHaveLength(1);
    expect(doc.meta.description).toBe("Time constant of R1 and C1");
  });

  test("malformed XML reads as an empty circuit with an error line", () => {
    const fc = parseFalstadXml(`<cir f="0"><r x="0 0 16 0"></cir>`);
    expect(fc.elements).toEqual([]);
    expect(fc.errors).toHaveLength(1);
  });
});
