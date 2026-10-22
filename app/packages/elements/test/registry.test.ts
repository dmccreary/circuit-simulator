import { allDescriptors, groupOf } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { getView } from "@cs/elements/views";
import { LazyRegistry } from "../src/lazy-registry";

describe("part groups and the lazy registry (circuit-model.md §5.4)", () => {
  test("every descriptor belongs to a group, Essentials first", () => {
    const all = allDescriptors();
    for (const d of all) expect(groupOf(d.type)).toBeDefined();
    expect(groupOf("resistor")).toBe("essentials");
    expect(groupOf("npn-transistor")).toBe("advanced");
    expect(groupOf("and-gate")).toBe("logic");
    expect(groupOf("no-such-part")).toBeUndefined();
    expect(groupOf(all[0].type)).toBe("essentials");
  });

  test("every non-ground part has a model and a view once its group is loaded", () => {
    // tests/setup/load-all-parts.ts loads every group before the suite.
    for (const d of allDescriptors()) {
      expect(getView(d.type), d.type).toBeDefined();
      if (d.type !== "ground") expect(getModelFactory(d.type), d.type).toBeDefined();
    }
  });

  test("loads only the groups a circuit needs, once, and notifies", async () => {
    const calls: string[] = [];
    const loader = (g: string, rec: Record<string, number>) => () => {
      calls.push(g);
      return Promise.resolve(rec);
    };
    const reg = new LazyRegistry<number>({ resistor: 1 }, {
      advanced: loader("advanced", { "npn-transistor": 2 }),
      logic: loader("logic", { "and-gate": 3 }),
      more: loader("more", { rail: 4 }),
    });
    const loaded: string[][] = [];
    reg.onLoaded((types) => loaded.push(types));
    expect(reg.missing(["resistor"])).toEqual([]);
    await reg.ensure(["resistor"]);
    expect(calls).toEqual([]);
    expect(reg.get("npn-transistor")).toBeUndefined();
    await Promise.all([reg.ensure(["npn-transistor", "resistor"]), reg.ensure(["pnp-transistor"])]);
    expect(calls).toEqual(["advanced"]);
    expect(reg.get("npn-transistor")).toBe(2);
    expect(loaded).toEqual([["npn-transistor"]]);
    expect(reg.missing(["and-gate"])).toEqual(["logic"]);
  });

  test("a failed group load can be retried", async () => {
    let fail = true;
    const reg = new LazyRegistry<number>({}, {
      advanced: () => (fail ? Promise.reject(new Error("offline")) : Promise.resolve({ "op-amp": 1 })),
      logic: () => Promise.resolve({}),
      more: () => Promise.resolve({}),
    });
    await expect(reg.ensure(["op-amp"])).rejects.toThrow("offline");
    fail = false;
    await reg.ensure(["op-amp"]);
    expect(reg.get("op-amp")).toBe(1);
  });
});
