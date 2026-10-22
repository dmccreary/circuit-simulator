import { applyPatches, createEditSystem, type CircuitDocument, type PatchBatch } from "@cs/model";
import { part, rcLoop } from "./fixtures";

const L = { key: "edit.test" };

function setup(normalize?: (d: CircuitDocument) => void) {
  const sys = createEditSystem(rcLoop(), { normalize });
  const batches: PatchBatch[] = [];
  let mirror = sys.doc;
  sys.onPatches((b) => {
    batches.push(b);
    mirror = applyPatches(mirror, b.patches);
  });
  return { sys, batches, mirror: () => mirror };
}

test("a transaction streams provisional patches and commits one undo step", () => {
  const { sys, batches, mirror } = setup();
  const tx = sys.begin(L);
  for (const r of [1100, 1200, 1300]) tx.update((d) => void (d.parts.r1.props.resistance = r));
  expect(batches.every((b) => b.provisional)).toBe(true);
  expect(batches).toHaveLength(3);
  tx.commit();
  expect(batches.at(-1)!.provisional).toBe(false);
  expect(sys.canUndo).toBe(true);
  expect(mirror()).toEqual(sys.doc);

  sys.undo();
  expect(sys.doc.parts.r1.props.resistance).toBe(1000);
  expect(sys.canUndo).toBe(false);
  expect(sys.canRedo).toBe(true);
  expect(batches.at(-1)!.source).toBe("undo");
  expect(mirror()).toEqual(sys.doc);

  sys.redo();
  expect(sys.doc.parts.r1.props.resistance).toBe(1300);
  expect(mirror()).toEqual(sys.doc);
});

test("cancel reverts every update", () => {
  const { sys, batches, mirror } = setup();
  const before = sys.doc;
  const tx = sys.begin(L);
  tx.update((d) => void (d.parts.r1.at = { x: 20, y: 20 }));
  tx.update((d) => void delete d.wires.w1);
  tx.cancel();
  expect(sys.doc).toBe(before);
  expect(batches.at(-1)!.source).toBe("cancel");
  expect(mirror()).toEqual(before);
  expect(sys.canUndo).toBe(false);
});

test("coalesceKey merges consecutive commits", () => {
  const { sys } = setup();
  for (let i = 0; i < 3; i++) sys.edit(L, (d) => void (d.parts.r1.at.x += 1), { coalesceKey: "nudge" });
  expect(sys.doc.parts.r1.at.x).toBe(7);
  sys.undo();
  expect(sys.doc.parts.r1.at.x).toBe(4);
  expect(sys.canUndo).toBe(false);

  sys.edit(L, (d) => void (d.parts.r1.at.x += 1), { coalesceKey: "nudge" });
  sys.edit(L, (d) => void (d.parts.r1.label = "RX"));
  sys.edit(L, (d) => void (d.parts.r1.at.x += 1), { coalesceKey: "nudge" });
  sys.undo();
  expect(sys.doc.parts.r1.at.x).toBe(5);
  expect(sys.doc.parts.r1.label).toBe("RX");
});

test("normalize runs at commit and is part of the undo step", () => {
  const { sys, batches, mirror } = setup((d) => {
    for (const p of Object.values(d.parts)) if (!p.label && p.type !== "ground") d.parts[p.id].label = "AUTO";
  });
  sys.edit(L, (d) => void (d.parts.r2 = part("r2", "resistor", 20, 0, { label: "" })));
  expect(sys.doc.parts.r2.label).toBe("AUTO");
  expect(batches.at(-1)!.patches).toEqual([{ op: "set", path: ["parts", "r2", "label"], value: "AUTO" }]);
  expect(mirror()).toEqual(sys.doc);
  sys.undo();
  expect(sys.doc.parts.r2).toBeUndefined();
});

test("a new edit clears redo; load resets history", () => {
  const { sys, batches } = setup();
  sys.edit(L, (d) => void (d.meta.title = "a"));
  sys.undo();
  sys.edit(L, (d) => void (d.meta.title = "b"));
  expect(sys.canRedo).toBe(false);
  sys.load(rcLoop());
  expect(sys.canUndo).toBe(false);
  expect(batches.at(-1)!.source).toBe("load");
});

test("only one open transaction at a time", () => {
  const { sys } = setup();
  sys.begin(L);
  expect(() => sys.begin(L)).toThrow();
});
