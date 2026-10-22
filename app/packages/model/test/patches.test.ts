import { applyPatches, createDocument, newId, produce } from "@cs/model";
import { doc, part, rcLoop } from "./fixtures";

describe("applyPatches", () => {
  test("copies only the path it touches", () => {
    const d = rcLoop();
    const next = applyPatches(d, [{ op: "set", path: ["parts", "r1", "props", "resistance"], value: 2200 }]);
    expect(next.parts.r1.props.resistance).toBe(2200);
    expect(d.parts.r1.props.resistance).toBe(1000);
    expect(next).not.toBe(d);
    expect(next.parts).not.toBe(d.parts);
    expect(next.parts.c1).toBe(d.parts.c1);
    expect(next.wires).toBe(d.wires);
    expect(next.parts.r1.at).toBe(d.parts.r1.at);
  });

  test("delete removes keys and array indices", () => {
    const d = createDocument({ lanes: [{ id: "a", kind: "analog" }, { id: "b", kind: "analog" }] });
    const next = applyPatches(d, [
      { op: "delete", path: ["lanes", 0] },
      { op: "delete", path: ["meta", "title"] },
    ]);
    expect(next.lanes.map((l) => l.id)).toEqual(["b"]);
    expect("title" in next.meta).toBe(false);
    expect(d.lanes).toHaveLength(2);
  });
});

describe("produce", () => {
  test("returns patches, inverse and shares untouched subtrees", () => {
    const d = rcLoop();
    const r = produce(d, (draft) => {
      draft.parts.r1.props.resistance = 4700;
      draft.parts.r1.at.x += 1;
    });
    expect(r.doc.parts.r1.props.resistance).toBe(4700);
    expect(r.doc.parts.c1).toBe(d.parts.c1);
    expect(r.doc.wires).toBe(d.wires);
    expect(applyPatches(d, r.patches)).toEqual(r.doc);
    expect(applyPatches(r.doc, r.inverse)).toEqual(d);
    expect(d.parts.r1.at.x).toBe(4);
  });

  test("no-op recipe keeps identity", () => {
    const d = rcLoop();
    const r = produce(d, (draft) => {
      draft.parts.r1.label = "R1";
      void draft.wires.w1.points[0].x;
    });
    expect(r.doc).toBe(d);
    expect(r.patches).toEqual([]);
  });

  test("array methods, deletes, and moving drafts", () => {
    const d = createDocument({ lanes: [{ id: "a", kind: "analog" }] });
    const r = produce(d, (draft) => {
      draft.lanes.push({ id: "b", kind: "logic" });
      draft.lanes.splice(0, 1);
      draft.parts.x = part("x", "resistor", 0, 0);
      draft.parts.y = draft.parts.x;
      delete draft.parts.x;
    });
    expect(r.doc.lanes.map((l) => l.id)).toEqual(["b"]);
    expect(Object.keys(r.doc.parts)).toEqual(["y"]);
    expect(applyPatches(d, r.patches)).toEqual(r.doc);
    expect(applyPatches(r.doc, r.inverse)).toEqual(d);
  });

  test("drafts nested in new values are finalized", () => {
    const d = doc([part("a", "resistor", 0, 0)]);
    const r = produce(d, (draft) => {
      draft.parts = { ...draft.parts, b: { ...draft.parts.a, id: "b" } };
      draft.parts.a.label = "RA";
    });
    expect(r.doc.parts.a.label).toBe("RA");
    expect(r.doc.parts.b.at).toBe(d.parts.a.at);
    expect(JSON.parse(JSON.stringify(r.doc.parts.b.at))).toEqual({ x: 0, y: 0 });
  });

  test("drafts are revoked after produce", () => {
    let leaked: { label: string } | undefined;
    produce(rcLoop(), (draft) => {
      leaked = draft.parts.r1;
    });
    expect(() => leaked!.label).toThrow();
  });
});

test("newId is prefixed and unique", () => {
  const ids = new Set(Array.from({ length: 200 }, () => newId("p")));
  expect(ids.size).toBe(200);
  for (const id of ids) expect(id).toMatch(/^p_[0-9a-z]+$/);
});
