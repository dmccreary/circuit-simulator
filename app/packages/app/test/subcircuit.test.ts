import type { Command } from "@cs/worker";
import { createMemoryBackend, createPersistence } from "@cs/persistence";
import { compile, decodeLayout, definitionOf } from "@cs/model";
import { parseCircuit } from "@cs/formats";
import { AppController } from "../src/controller";
import { rcChargingCircuit } from "../src/demo-circuit";
import type { WorkerPort } from "../src/sim/sim-client";
import { subcircuitsOf } from "../src/subcircuit/session";
import { placeMyPart } from "../src/subcircuit/install";
import { useStorage } from "../src/my-circuits/storage";
import { MyCircuitsStore } from "../src/my-circuits/store";
import { myCircuitsOf } from "../src/my-circuits/session";
import { filesOf } from "../src/files/install";
import { thumbnailSvg } from "../src/my-circuits/thumbnail";

// Some shell features start a render ticker; Node has no animation frames.
globalThis.requestAnimationFrame ??= (() => 0) as never;
globalThis.cancelAnimationFrame ??= (() => undefined) as never;

function setup() {
  const sent: Command[] = [];
  const port: WorkerPort = { postMessage: (m) => void sent.push(m), onmessage: null };
  const c = new AppController(rcChargingCircuit(), { worker: port });
  const persistence = createPersistence(createMemoryBackend());
  useStorage(c, persistence);
  return { c, s: subcircuitsOf(c), persistence };
}

/** R1 and C1 of the RC demo become a block. */
function makeRc(c: AppController) {
  const s = subcircuitsOf(c);
  c.store.set({ selection: ["R1", "C1", "w3"] });
  const pins = s.propose(["R1", "C1", "w3"]);
  expect(pins?.length).toBeGreaterThanOrEqual(2);
  const inst = s.make(["R1", "C1", "w3"], "RC", pins!.map((p, i) => ({ ...p, name: `p${i}` })));
  expect(inst).toBeDefined();
  return inst!;
}

describe("subcircuits in the editor", () => {
  test("Make subcircuit keeps the netlist connectivity and names the pins", () => {
    const { c } = setup();
    const before = compile(c.edits.doc, c.resolver);
    const inst = makeRc(c);
    const doc = c.edits.doc;
    expect(doc.parts.R1).toBeUndefined();
    expect(decodeLayout(doc.parts[inst].props.pinLayout).pins.map((p) => p.name)).toEqual(["p0", "p1"]);
    const after = compile(doc, c.resolver);
    const byId = (cc: typeof before, id: string) => cc.netlist.elements.find((e) => e.id === id || e.id.endsWith(`/${id}`))!;
    // Same partition of terminals into nodes.
    const groups = (cc: typeof before) => {
      const m = new Map<number, string[]>();
      for (const id of ["V1", "S1", "R1", "C1"]) byId(cc, id).nodes.forEach((n, i) => m.set(n, [...(m.get(n) ?? []), `${id}:${i}`]));
      return [...m.values()].map((g) => g.sort().join(" ")).sort();
    };
    expect(groups(after)).toEqual(groups(before));
    // The demo's probe on C1 follows it inside.
    expect(doc.probes.P1.target).toEqual({ kind: "across", part: `${inst}/C1` });
    expect(c.store.get().selection).toEqual([inst]);
    // Undo restores the original parts.
    c.edits.undo();
    expect(c.edits.doc.parts.R1).toBeDefined();
  });

  test("looking inside shows the definition, edits land in it, Esc goes back", () => {
    const { c, s } = setup();
    const inst = makeRc(c);
    const defId = definitionOf(c.edits.doc.parts[inst])!;
    c.store.set({ selection: [inst] });
    expect(c.commands.run("subcircuit.lookInside")).toBe(true);
    expect(s.ui.get().path.map((f) => f.instance)).toEqual([inst]);
    expect(Object.keys(c.sheetDoc().parts).sort()).toEqual(["C1", "R1"]);
    // The inner compiled view knows the inner parts' nodes.
    const inner = c.sheetCompiled()!;
    expect(inner.netlist.elements.some((e) => e.id === "R1")).toBe(true);

    // Inspector-style value edit on an inner part.
    c.editSheet({ key: "edit.setValue" }, (d) => {
      d.parts.R1.props.resistance = 4700;
    });
    expect(c.edits.doc.subcircuits[defId].parts.R1.props.resistance).toBe(4700);
    expect(c.edits.doc.parts.R1).toBeUndefined();

    // Delete through the normal command while inside.
    c.store.set({ selection: ["C1"] });
    c.commands.run("edit.delete");
    expect(c.edits.doc.subcircuits[defId].parts.C1).toBeUndefined();
    // Its probe went with it.
    expect(c.edits.doc.probes.P1).toBeUndefined();
    c.edits.undo();
    expect(c.edits.doc.subcircuits[defId].parts.C1).toBeDefined();

    // A probe added through a tool transaction inside is stored with the path.
    const tx = c.beginEdit({ key: "probe.add" });
    tx.update((d) => {
      d.probes.Q = { ...structuredClone(c.edits.doc.probes.P1), id: "Q", target: { kind: "terminal", part: "R1", terminal: 0 } };
    });
    tx.commit();
    expect(c.edits.doc.probes.Q.target).toEqual({ kind: "terminal", part: `${inst}/R1`, terminal: 0 });
    expect(compile(c.edits.doc, c.resolver).channels.Q).toBeDefined();

    expect(c.commands.run("subcircuit.exit")).toBe(true);
    expect(s.ui.get().path).toEqual([]);
    expect(c.sheetDoc()).toBe(c.edits.doc);
  });

  test("a second copy asks: every copy, or only this one (EDT-38)", () => {
    const { c, s } = setup();
    const inst = makeRc(c);
    const defId = definitionOf(c.edits.doc.parts[inst])!;
    const at = placeMyPart(c, defId, { x: 40, y: 0 })!;
    expect(definitionOf(c.edits.doc.parts[at])).toBe(defId);
    s.lookInside(at);
    expect(s.ui.get().dialog).toMatchObject({ kind: "scope", copies: 2 });
    s.chooseScope("one");
    const copy = definitionOf(c.edits.doc.parts[at])!;
    expect(copy).not.toBe(defId);
    expect(s.ui.get().path.at(-1)?.definition).toBe(copy);
    c.editSheet({ key: "t" }, (d) => {
      d.parts.R1.props.resistance = 1;
    });
    expect(c.edits.doc.subcircuits[copy].parts.R1.props.resistance).toBe(1);
    expect(c.edits.doc.subcircuits[defId].parts.R1.props.resistance).toBe(10e3);
  });

  test("a sealed black box cannot be opened (EDT-37)", () => {
    const { c, s } = setup();
    const inst = makeRc(c);
    c.store.set({ selection: [inst] });
    c.commands.run("subcircuit.toggleSeal");
    const defId = definitionOf(c.edits.doc.parts[inst])!;
    expect(c.edits.doc.subcircuits[defId].sealed).toBe(true);
    expect(c.commands.enabled("subcircuit.lookInside")).toBe(false);
    expect(s.lookInside(inst)).toBe(false);
    expect(s.ui.get().path).toEqual([]);
    // Still simulates: the flattened parts are in the netlist.
    expect(compile(c.edits.doc, c.resolver).netlist.elements.some((e) => e.id === `${inst}/R1`)).toBe(true);
  });

  test("My parts keeps the definition and places it in another circuit (EDT-35)", async () => {
    const { c, s, persistence } = setup();
    const inst = makeRc(c);
    const defId = definitionOf(c.edits.doc.parts[inst])!;
    await new Promise((r) => setTimeout(r, 0));
    const list = await s.loadMyParts();
    expect(list.map((r) => r.id)).toEqual([defId]);

    const other = new AppController(rcChargingCircuit(), { worker: { postMessage: () => undefined, onmessage: null } });
    useStorage(other, persistence);
    await subcircuitsOf(other).loadMyParts();
    const placed = placeMyPart(other, defId, { x: 30, y: 30 })!;
    expect(other.edits.doc.subcircuits[defId].name).toBe("RC");
    expect(compile(other.edits.doc, other.resolver).netlist.elements.some((e) => e.id === `${placed}/C1`)).toBe(true);
  });

  test("a circuit with subcircuits round-trips through the native file", () => {
    const { c } = setup();
    makeRc(c);
    const text = filesOf(c).fileText();
    const { doc } = parseCircuit(text);
    expect(doc.subcircuits).toEqual(c.edits.doc.subcircuits);
  });
});

describe("My circuits (FIL-08)", () => {
  test("store operations: save, list newest first, rename, duplicate, delete", async () => {
    let now = 1000;
    let n = 0;
    const store = new MyCircuitsStore({ persistence: createPersistence(createMemoryBackend()), now: () => now++, newId: () => `c${++n}` });
    const a = await store.save({ name: "First", text: "{}", thumbnailSvg: "<svg/>" });
    const b = await store.save({ name: "Second", text: "{}" });
    expect((await store.list()).map((r) => r.name)).toEqual(["Second", "First"]);
    expect(await store.rename(a, "  Renamed ")).toBe(true);
    expect((await store.list())[0]).toMatchObject({ id: a, name: "Renamed" });
    const copy = await store.duplicate(a);
    expect((await store.get(copy!))).toMatchObject({ name: "Renamed (copy)", thumbnailSvg: "<svg/>" });
    await store.remove(b);
    expect((await store.list()).map((r) => r.id).sort()).toEqual([a, copy].sort());
    expect(await store.rename("missing", "x")).toBe(false);
  });

  test("Save to My circuits and open it again", async () => {
    const { c } = setup();
    const mc = myCircuitsOf(c);
    const id = await mc.saveCurrent();
    expect(id).toBeDefined();
    const rec = (await mc.refresh())[0];
    expect(rec.name).toBe("RC charging");
    expect(rec.thumbnailSvg).toMatch(/^<svg[^>]*>.*polyline/);
    // Saving again updates the same entry.
    c.edits.edit({ key: "t" }, (d) => {
      d.parts.R1.props.resistance = 1;
    });
    await mc.saveCurrent();
    expect((await mc.refresh()).length).toBe(1);
    // Open it into a changed document (forced past the unsaved-work question).
    c.edits.edit({ key: "t" }, (d) => {
      delete d.parts.R1;
    });
    const files = filesOf(c);
    files.ask = async () => true;
    expect(await mc.open(id!)).toBe(true);
    expect(c.edits.doc.parts.R1.props.resistance).toBe(1);
  });

  test("thumbnails fit the drawing into the box", () => {
    const svg = thumbnailSvg(rcChargingCircuit(), (p) => [p.at, { x: p.at.x + 4, y: p.at.y }], 100, 50);
    expect(svg).toContain('viewBox="0 0 100 50"');
    for (const m of svg.matchAll(/points="([^"]+)"/g))
      for (const xy of m[1].split(" ")) {
        const [x, y] = xy.split(",").map(Number);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(50);
      }
  });
});
