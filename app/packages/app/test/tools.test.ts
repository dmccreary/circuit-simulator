import { createDocument, type CircuitDocument, type MessageRef } from "@cs/model";
import { HitIndex, ViewTransform, type HitResult } from "@cs/render";
import type { ElementDescriptor } from "@cs/elements";
import { ToolController } from "../src/tools/controller";
import { routeL, nextLabel } from "../src/tools/route";
import { probeTargetFor } from "../src/tools/probe";
import type { CanvasPointer, ToolContext, TxLike } from "../src/tools/types";
import type { ToolSpec } from "../src/app-state";

const resistor: ElementDescriptor = {
  type: "resistor",
  category: "passive",
  aliases: [],
  labelPrefix: "R",
  terminals: [{ name: "1", at: { x: 0, y: 0 } }, { name: "2", at: { x: 4, y: 0 } }],
  stretchable: { min: 2, default: 4 },
  props: [{ key: "resistance", unit: "ohm", default: 1000 }],
  readouts: [],
};
const sw: ElementDescriptor = { ...resistor, type: "switch", labelPrefix: "S", props: [{ key: "closed", unit: "", kind: "boolean", default: false }], traits: { shortWhenProp: "closed" } };
const logicIn: ElementDescriptor = { ...resistor, type: "logic-input", labelPrefix: "IN", props: [{ key: "high", unit: "", kind: "boolean", default: false }], traits: { toggleProp: "high" } };

/** A ToolContext over a plain document with a toy transaction and hit index. */
function harness() {
  let doc: CircuitDocument = createDocument();
  const log: string[] = [];
  const view = new ViewTransform(); // 16 px per grid unit, origin at 0,0
  let selection: string[] = [];
  let ids = 0;
  const hits = new HitIndex();
  const rebuild = () => {
    hits.clear();
    for (const p of Object.values(doc.parts)) {
      hits.insert({ kind: "part", part: p.id, box: { x: p.at.x, y: p.at.y - 1, w: 4, h: 2 } });
      hits.insert({ kind: "terminal", part: p.id, terminal: 0, at: p.at });
      hits.insert({ kind: "terminal", part: p.id, terminal: 1, at: { x: p.at.x + 4, y: p.at.y } });
    }
    for (const w of Object.values(doc.wires))
      for (let i = 0; i + 1 < w.points.length; i++) hits.insert({ kind: "segment", wire: w.id, segment: i, from: w.points[i], to: w.points[i + 1] });
  };
  let controller!: ToolController;
  const ctx: ToolContext = {
    get doc() {
      return doc;
    },
    begin(label: MessageRef): TxLike {
      const start = doc;
      log.push(`begin ${label.key}`);
      return {
        update(recipe) {
          const draft = structuredClone(doc);
          recipe(draft);
          doc = draft;
        },
        commit() {
          log.push(`commit ${label.key}`);
          rebuild();
        },
        cancel() {
          doc = start;
          log.push(`cancel ${label.key}`);
        },
      };
    },
    hit: (p): HitResult[] => hits.query(view.toGrid(p), 0.4),
    view,
    descriptor: (t) => (t === "resistor" ? resistor : t === "switch" ? sw : t === "logic-input" ? logicIn : undefined),
    terminals: (p) => [p.at, { x: p.at.x + 4, y: p.at.y }],
    selection: () => selection,
    select: (s) => void (selection = s),
    setTool: (t: ToolSpec) => {
      log.push(`tool ${t.id}`);
      controller.setTool(t);
    },
    setHover: () => {},
    invalidateView: () => {},
    invalidateOverlay: () => {},
    newId: (p) => `${p}${++ids}`,
  };
  controller = new ToolController(ctx);
  return { ctx, controller, log, get doc() { return doc; }, get selection() { return selection; } };
}

const at = (gx: number, gy: number, extra: Partial<CanvasPointer> = {}): CanvasPointer => ({
  x: gx * 16,
  y: gy * 16,
  button: 0,
  shiftKey: false,
  time: 0,
  ...extra,
});
const key = (k: string) => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });

describe("route helpers", () => {
  test("right-angled route, horizontal first, no zero-length legs", () => {
    expect(routeL({ x: 0, y: 0 }, { x: 4, y: 3 })).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }]);
    expect(routeL({ x: 0, y: 0 }, { x: 4, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }]);
  });
  test("next label", () => {
    const d = createDocument();
    d.parts.a = { id: "a", type: "resistor", label: "R2", at: { x: 0, y: 0 }, orientation: { rot: 0, flip: false }, props: {} };
    expect(nextLabel(d, "R")).toBe("R3");
    expect(nextLabel(d, "C")).toBe("C1");
  });
  test("probe target from a segment hit carries the fraction along it", () => {
    expect(probeTargetFor({ kind: "segment", wire: "w", segment: 0, from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }, { x: 2.5, y: 0.1 })).toEqual({
      kind: "point",
      wire: "w",
      segment: 0,
      t: 0.25,
    });
  });
});

describe("ToolController", () => {
  test("place: preview, rotate with R, click places one part and returns to select", () => {
    const h = harness();
    h.ctx.setTool({ id: "place", type: "resistor" });
    expect(h.controller.tool.id).toBe("place");
    h.controller.pointerMove(at(3.2, 4.9));
    expect(h.controller.key(key("r"))).toBe(true);
    h.controller.pointerDown(at(3.2, 4.9));
    const parts = Object.values(h.doc.parts);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: "resistor", label: "R1", at: { x: 3, y: 5 }, orientation: { rot: 90 }, length: 4, props: { resistance: 1000 } });
    expect(h.selection).toEqual([parts[0].id]);
    expect(h.controller.tool.id).toBe("select");
  });

  test("select: drag moves a part in one transaction; Esc mid-drag cancels", () => {
    const h = harness();
    h.ctx.setTool({ id: "place", type: "resistor" });
    h.controller.pointerDown(at(0, 0));
    const id = Object.keys(h.doc.parts)[0];
    h.log.length = 0;
    h.controller.pointerDown(at(2, 0));
    h.controller.pointerMove(at(3, 1));
    h.controller.pointerMove(at(5, 2));
    h.controller.pointerUp(at(5, 2));
    expect(h.doc.parts[id].at).toEqual({ x: 3, y: 2 });
    expect(h.log).toEqual(["begin edit.move", "commit edit.move"]);

    h.controller.pointerDown(at(5, 2));
    h.controller.pointerMove(at(9, 2));
    expect(h.doc.parts[id].at).toEqual({ x: 7, y: 2 });
    h.controller.key(key("Escape"));
    expect(h.doc.parts[id].at).toEqual({ x: 3, y: 2 });
  });

  test("select: click on empty space clears selection and drags pan the view", () => {
    const h = harness();
    h.ctx.select(["x"]);
    h.controller.pointerDown(at(20, 20));
    expect(h.selection).toEqual([]);
    h.controller.pointerMove(at(21, 20));
    h.controller.pointerUp(at(21, 20));
    expect(h.ctx.view.offsetX).toBe(16);
  });

  test("select: double-click toggles a switch", () => {
    const h = harness();
    h.ctx.setTool({ id: "place", type: "switch" });
    h.controller.pointerDown(at(0, 0));
    const id = Object.keys(h.doc.parts)[0];
    h.controller.pointerDown(at(2, 0, { time: 1000 }));
    h.controller.pointerUp(at(2, 0, { time: 1010 }));
    h.controller.pointerDown(at(2, 0, { time: 1200 }));
    h.controller.pointerUp(at(2, 0, { time: 1210 }));
    expect(h.doc.parts[id].props.closed).toBe(true);
  });

  test("select: double-click toggles a logic input through toggleProp", () => {
    const h = harness();
    h.ctx.setTool({ id: "place", type: "logic-input" });
    h.controller.pointerDown(at(0, 0));
    const id = Object.keys(h.doc.parts)[0];
    h.controller.pointerDown(at(2, 0, { time: 1000 }));
    h.controller.pointerUp(at(2, 0, { time: 1010 }));
    h.controller.pointerDown(at(2, 0, { time: 1200 }));
    h.controller.pointerUp(at(2, 0, { time: 1210 }));
    expect(h.doc.parts[id].props.high).toBe(true);
  });

  test("wire: drag draws an L wire; click–click also works; zero length is ignored", () => {
    const h = harness();
    h.ctx.setTool({ id: "wire" });
    h.controller.pointerDown(at(0, 0));
    h.controller.pointerMove(at(4, 3));
    h.controller.pointerUp(at(4, 3));
    expect(Object.values(h.doc.wires)[0].points).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }]);

    h.controller.pointerDown(at(10, 10));
    h.controller.pointerUp(at(10, 10)); // click: enter click mode
    expect(Object.keys(h.doc.wires)).toHaveLength(1);
    h.controller.pointerMove(at(10, 14));
    h.controller.pointerDown(at(10, 14));
    expect(Object.keys(h.doc.wires)).toHaveLength(2);

    h.controller.pointerDown(at(1, 1));
    h.controller.key(key("Escape"));
    expect(h.controller.tool.id).toBe("select");
    expect(Object.keys(h.doc.wires)).toHaveLength(2);
  });

  test("probe: click on a terminal adds a voltage probe and a lane", () => {
    const h = harness();
    h.ctx.setTool({ id: "place", type: "resistor" });
    h.controller.pointerDown(at(0, 0));
    const id = Object.keys(h.doc.parts)[0];
    h.ctx.setTool({ id: "probe-v" });
    h.controller.pointerDown(at(4, 0));
    const probes = Object.values(h.doc.probes);
    expect(probes).toHaveLength(1);
    expect(probes[0]).toMatchObject({ quantity: "voltage", name: "V1", target: { kind: "terminal", part: id, terminal: 1 } });
    expect(h.doc.lanes).toHaveLength(1);
    expect(probes[0].lane).toBe(h.doc.lanes[0].id);
    expect(h.controller.tool.id).toBe("select");
  });
});
