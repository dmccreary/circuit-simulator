// Falstad chips (mapping-chips.ts): counters, multiplexers, converters, ROM,
// custom logic, LED array, and XML buses expanded into single-bit nets (bus.ts),
// plus export back (FIL-19).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPartResolver, getDescriptor, terminalPositions } from "@cs/elements";
import { exportFalstad, importFalstad } from "@cs/formats";
import { compile } from "@cs/model";

const library = (name: string) => readFileSync(fileURLToPath(new URL(`../../../public/circuits/${name}`, import.meta.url)), "utf8");

function one(line: string, settings = "$ 1 5.0E-6 10 50 5.0 50", models: string[] = [], px = 16) {
  const { doc, report } = importFalstad(`${settings}\n${models.join("\n")}\n${line}\n`);
  expect(report.unsupported).toEqual([]);
  const part = Object.values(doc.parts)[0];
  const posts = terminalPositions(part, getDescriptor(part.type)!).map((p) => [p.x * px, p.y * px]);
  return { doc, part, posts };
}

/** ChipElm post (unflipped, 32-pixel spacing) in pixels from point1. */
const W = (x: number, y: number, k: number) => [x, y + 32 * k];
const E = (x: number, y: number, sizeX: number, k: number) => [x + 32 * (sizeX + 1), y + 32 * k];

describe("Falstad chips", () => {
  test("CounterElm: clock W0, R at the bottom, Q down the right MSB first, saved count", () => {
    const { part, posts } = one("164 176 336 240 336 0 3 5 0 5 false 0");
    expect(part.type).toBe("counter-3");
    expect(posts).toEqual([W(176, 336, 0), W(176, 336, 2), E(176, 336, 2, 0), E(176, 336, 2, 1), E(176, 336, 2, 2)]);
    expect(part.props).toMatchObject({ invertReset: false, modulus: 0 });
    expect(part.savedState).toEqual([0, 0, 0, 1, 0, 1]);
  });

  test("RingCounterElm with clock inhibit, MultiplexerElm and DeMultiplexerElm", () => {
    const r = one("163 368 320 384 320 2 10 0 0 0 0 0 0 0 5 0 0");
    expect(r.part.type).toBe("ring-counter-10-ce");
    expect(r.posts[0]).toEqual([368, 352]);
    expect(r.posts[2]).toEqual([400, 288]); // Q0 at N0
    expect(r.part.savedState![1 + 2 + 7]).toBe(1);
    const m = one("184 352 208 384 208 0 1");
    expect(m.part.type).toBe("multiplexer-1");
    expect(m.posts).toEqual([W(352, 208, 0), W(352, 208, 1), [352 + 64, 208 + 96], E(352, 208, 2, 0)]);
    const d = one("185 480 656 656 656 0 3");
    expect(d.part.type).toBe("demultiplexer-3");
    expect(d.posts[0]).toEqual(E(480, 656, 4, 0));
    expect(d.posts[11]).toEqual(W(480, 656, 0));
  });

  test("small chips on an 8-pixel circuit: CounterElm, LatchElm, DACElm, ADCElm", () => {
    const s = "$ 3 5.0E-6 10 50 5.0 50";
    const c = one("164 432 304 480 304 1 4 0.0 0.0 0.0 0.0\nw 8 8 16 8 0", s, [], 8);
    expect(c.part.type).toBe("counter-4");
    expect(c.posts[2]).toEqual([432 + 48, 304]);
    const l = one("168 480 304 512 304 1 4\nw 8 8 16 8 0", s, [], 8);
    expect(l.part.props.edgeTriggered).toBe(true);
    expect(l.posts[0]).toEqual([480, 304 + 48]); // I0 at the bottom
    const a = one("167 288 96 296 96 1 4\nw 8 8 16 8 0", s, [], 8);
    expect(a.part.type).toBe("adc-4");
    expect(a.posts.slice(4)).toEqual([
      [288, 96],
      [288, 96 + 48],
    ]);
  });

  test("CustomLogicElm reads its ! model line", () => {
    const model = "! smiley 0 S2,S1,S0 A,B,C,D,E,F,G,H smiley\\sgenerator 000\\q00111100\\n001\\q01000010\\n";
    const { part } = one("208 528 336 624 336 0 smiley 0 0 5 5 5 5 0 0", undefined, [model]);
    expect(part.type).toBe("custom-logic-3x8");
    expect(part.props).toMatchObject({ inputNames: "S2,S1,S0", title: "smiley generator", rules: "000=00111100\n001=01000010\n" });
    expect(part.savedState!.slice(1)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0]);
  });

  test("ROMElm contents and LEDArrayElm", () => {
    const { part } = one("436 0 0 32 0 0 4 4 0 1 2 3 -1 8 15 -1 -2");
    expect(part.props.contents).toBe("0: 1 2 3\n8: 15");
    expect(one("405 720 336 784 336 0 8 8").part.type).toBe("led-array-8x8");
  });

  test("the library files import with no placeholders and export back", () => {
    for (const f of ["piso-sr.txt", "ledarray.txt", "graycode.txt", "ledflasher.txt", "traffic.txt", "ringcascade.txt", "hfadc.txt", "qam-256.txt"]) {
      const { doc, report } = importFalstad(library(f));
      expect(report.unsupported.filter((u) => u.code !== "403"), f).toEqual([]);
      const out = exportFalstad(doc);
      const ours = new Set(out.report.skipped.map((s) => s.part));
      const chips = Object.values(doc.parts).filter((p) => /counter|plex|latch|dac|adc|t-flip|led-array|custom-logic|rom/.test(p.type));
      const back = importFalstad(out.text).doc;
      const where = (d: typeof doc) => new Set(Object.values(d.parts).map((p) => `${p.type}@${p.at.x},${p.at.y}`));
      const again = where(back);
      for (const p of chips) if (!ours.has(p.id)) expect(again.has(`${p.type}@${p.at.x},${p.at.y}`), `${f}: ${p.type}`).toBe(true);
      expect(chips.filter((p) => p.orientation.rot === 0 && !p.orientation.flip && ours.has(p.id)), f).toEqual([]);
    }
  });
});

describe("XML buses", () => {
  test("td4.txt: bus chips map and each bus bit becomes its own net", () => {
    const { doc, report } = importFalstad(library("td4.txt"));
    expect(report.unsupported).toEqual([]);
    const c = compile(doc, createPartResolver());
    expect(c.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const nl = c.netlist;
    const el = (type: string) => nl.elements.filter((e) => e.type === type);
    const [rom] = el("rom-4x8-bus");
    const counters = el("sync-counter-4-bus");
    // The program counter's Q outputs (MSB first) drive the ROM address (MSB first).
    const pc = counters.find((k) => rom.nodes.slice(1, 5).every((n, i) => n === k.nodes[i]));
    expect(pc).toBeDefined();
    // Every bit is a distinct net.
    expect(new Set(rom.nodes.slice(1, 5)).size).toBe(4);
    // The adder's sum bus feeds every register's load inputs.
    const [adder] = el("full-adder-4-bus");
    for (const k of counters) expect(k.nodes.slice(4, 8).reverse()).toEqual(adder.nodes.slice(8, 12));
    // The instruction display reads the ROM data bus (bit z on its terminal z, ROM D LSB last).
    const [ins] = el("instruction-display-8");
    expect(ins.nodes).toEqual(rom.nodes.slice(5).reverse());
  });

  test("alu74181.txt: a bus splitter feeds an instruction display", () => {
    const { doc, report } = importFalstad(library("alu74181.txt"));
    expect(report.unsupported.filter((u) => u.code === "433" || u.code === "ins")).toEqual([]);
    const nl = compile(doc, createPartResolver()).netlist;
    const [ins] = nl.elements.filter((e) => e.type === "instruction-display-5");
    expect(new Set(ins.nodes).size).toBe(5);
  });
});
