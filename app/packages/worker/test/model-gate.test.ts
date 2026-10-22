import { createModelGate } from "../src/model-gate";

test("the model gate keeps command order while a netlist's models load", async () => {
  const delivered: string[] = [];
  const loaded = new Set<string>(["resistor"]);
  let release!: () => void;
  const gate = createModelGate<{ id: string; types?: string[] }>({
    deliver: (c) => delivered.push(c.id),
    typesOf: (c) => c.types ?? null,
    typesLoaded: (ts) => [...ts].every((t) => loaded.has(t)),
    ensureTypes: () =>
      new Promise<void>((r) => {
        release = () => {
          loaded.add("and-gate");
          r();
        };
      }),
  });
  gate({ id: "a", types: ["resistor"] });
  expect(delivered).toEqual(["a"]); // synchronous when nothing is missing
  gate({ id: "b", types: ["and-gate"] });
  gate({ id: "c" });
  expect(delivered).toEqual(["a"]);
  release();
  await new Promise((r) => setTimeout(r, 0));
  expect(delivered).toEqual(["a", "b", "c"]);
  gate({ id: "d" });
  expect(delivered).toEqual(["a", "b", "c", "d"]);
});
