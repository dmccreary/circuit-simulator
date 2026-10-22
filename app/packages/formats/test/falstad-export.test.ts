// Falstad export (FIL-19): documents written as Falstad text re-import to the same parts.
import { exportFalstad, importFalstad, parseFalstadText } from "@cs/formats";
import { LRC_TXT } from "./fixtures";

const LINES = [
  "v 112 368 112 48 0 0 40 9 0 0 0.5",
  "v 400 368 400 48 0 1 60 5 1 0 0.5",
  "r 112 48 240 48 0 470",
  "c 240 48 240 368 0 0.000001 2 0",
  "l 240 368 400 368 0 0.5 0.01 0",
  "s 400 48 480 48 0 0 false",
  "S 480 48 480 128 0 1 false 0 2",
  "d 480 128 480 192 2 default",
  "162 480 192 480 256 0 0 1 0 0.02",
  "t 304 240 352 240 1 1 0 0 150 default",
  "f 304 400 368 400 8 1.5 0.02",
  "a 192 192 336 192 9 12 -12 1000000 0 0 2000",
  "174 144 240 80 272 0 100 0.7 X",
  "T 272 448 352 448 4 2 0.5 0 0 0.98",
  "R 336 96 336 48 0 2 1000 2.5 2.5 0 0.25",
  "150 560 160 656 160 0 2 0",
  "151 560 288 656 288 0 3 0",
  "L 528 400 480 400 0 1 false 5 0",
  "M 656 400 704 400 0 2.5",
  "178 128 560 208 560 22 1 0.1 0 0.05 1000000 0.02 50 0.02 0.005 0",
  "165 224 640 272 640 4 5",
  "171 112 800 256 800 0 1e-8 75 64 0",
  "213 560 640 608 640 0 2 -(a-b)/1000",
  "207 704 160 704 128 4 out",
  "x 64 16 128 32 4 24 Hello\\sworld",
];

describe("Falstad export", () => {
  test("every part comes back with the same placement and props", () => {
    const { doc } = importFalstad(`$ 1 5e-6 10 50 5 50\n${LINES.join("\n")}\n`);
    const { text, report } = exportFalstad(doc);
    expect(report.skipped).toEqual([]);
    const back = importFalstad(text).doc;
    const key = (p: (typeof doc.parts)[string]) => `${p.type}@${p.at.x},${p.at.y}`;
    const byKey = new Map(Object.values(back.parts).map((p) => [key(p), p]));
    for (const p of Object.values(doc.parts)) {
      const q = byKey.get(key(p));
      expect(q, key(p)).toBeDefined();
      expect(q!.orientation.rot, key(p)).toBe(p.orientation.rot);
      if (!/-gate/.test(p.type)) expect(q!.orientation.flip, key(p)).toBe(p.orientation.flip);
      expect(q!.length, key(p)).toBe(p.length);
      for (const [k, v] of Object.entries(p.props)) {
        if (typeof v === "number") expect(q!.props[k], `${key(p)}.${k}`).toBeCloseTo(v, 9);
        else expect(q!.props[k], `${key(p)}.${k}`).toEqual(v);
      }
    }
    expect(Object.values(back.netLabels).map((l) => l.name)).toEqual(["out"]);
    expect(Object.values(back.annotations).map((a) => a.text)).toEqual(["Hello world"]);
  });

  test("lrc.txt survives with its wires and scopes", () => {
    const { doc } = importFalstad(LRC_TXT);
    const { text } = exportFalstad(doc);
    const fc = parseFalstadText(text);
    expect(fc.scopes).toHaveLength(Object.keys(doc.probes).length);
    const back = importFalstad(text).doc;
    expect(Object.keys(back.parts)).toHaveLength(Object.keys(doc.parts).length);
    const pts = (d: typeof doc) => new Set(Object.values(d.wires).flatMap((w) => w.points.map((p) => `${p.x},${p.y}`)));
    for (const p of pts(doc)) expect(pts(back).has(p)).toBe(true);
  });

  test("parts with no Falstad form are reported, not written", () => {
    const { doc } = importFalstad("r 0 0 64 0 0 100\n");
    const part = Object.values(doc.parts)[0];
    doc.parts.q = { ...part, id: "q", type: "vcvs", props: {} };
    const { text, report } = exportFalstad(doc);
    expect(report.skipped).toEqual([{ part: "q", type: "vcvs" }]);
    expect(text.trim().split("\n")).toHaveLength(2);
  });
});
