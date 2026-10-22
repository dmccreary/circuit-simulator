// @vitest-environment jsdom
// The renderer asks for views of lazily loaded part groups and redraws when they arrive.
import { createDocument, type Part } from "@cs/model";
import { getDescriptor, localToDocument, terminalPositions, type ElementView } from "@cs/elements";
import { getView } from "@cs/elements/views";
import { RenderScheduler, SchematicRenderer, type ElementAccess } from "@cs/render";

test("missing views are requested once and the circuit is rebuilt when they load", async () => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  const available = new Set(["resistor"]);
  const requested: string[][] = [];
  let release!: () => void;
  const access: ElementAccess = {
    getView: (t) => (available.has(t) ? getView(t) : undefined) as ElementView | undefined,
    getDescriptor,
    terminalPositions,
    localToDocument,
    ensureTypes: (types) => {
      requested.push(types);
      return new Promise<void>((r) => {
        release = () => {
          types.forEach((t) => available.add(t));
          r();
        };
      });
    },
  };
  const part = (id: string, type: string, x: number): Part => ({ id, type, label: id, at: { x, y: 0 }, orientation: { rot: 0, flip: false }, props: {} });
  const doc = createDocument({ parts: { R1: part("R1", "resistor", 0), Q1: part("Q1", "npn-transistor", 10) } });
  const r = new SchematicRenderer(document.createElement("div"), new RenderScheduler({ request: () => 0, cancel: () => {} }), access);
  r.setCircuit(doc);
  r.setCircuit(doc); // no second request while loading
  expect(requested).toEqual([["npn-transistor"]]);
  const before = r.contentBox()!.w;
  release();
  await new Promise((done) => setTimeout(done, 0));
  // Q1's box now comes from the real transistor view, not the 1 x 1 placeholder.
  expect(r.contentBox()!.w).toBeGreaterThan(before + 1);
  r.setCircuit(doc);
  expect(requested).toHaveLength(1);
  r.dispose();
});
