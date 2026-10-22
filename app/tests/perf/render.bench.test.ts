// @vitest-environment jsdom
// Schematic draw micro-benchmark (rendering.md §2.2): a ~150-part ladder
// drawn into a counting fake 2-D context. Prints canvas calls per layer and
// the time per frame of the live and dots layers, which redraw every frame.

import { createDocument, compile, type CircuitDocument, type Part, type Wire } from "@cs/model";
import { createPartResolver, getDescriptor, localToDocument, terminalPositions } from "@cs/elements";
import { getView } from "@cs/elements/views";
import { RenderScheduler, SchematicRenderer, lightTheme, type ElementAccess } from "@cs/render";

const STAGES = 75;

function ladderDocument(): CircuitDocument {
  const part = (id: string, type: string, x: number, y: number, rot: 0 | 90, props: Part["props"], length?: number): Part => ({
    id,
    type,
    label: id,
    at: { x, y },
    orientation: { rot, flip: false },
    props,
    ...(length ? { length } : {}),
  });
  const parts: Part[] = [part("V1", "battery", 0, 0, 90, { voltage: 5 }, 4), part("G1", "ground", 0, 4, 0, {})];
  const wires: Wire[] = [];
  for (let k = 0; k < STAGES; k++) {
    const x = 4 * k;
    parts.push(part(`R${k}`, "resistor", x, 0, 0, { resistance: 1000 }, 4));
    parts.push(part(`C${k}`, "capacitor", x + 4, 0, 90, { capacitance: 1e-6 }, 4));
    wires.push({ id: `w${k}`, points: [{ x, y: 4 }, { x: x + 4, y: 4 }] });
  }
  return createDocument({
    parts: Object.fromEntries(parts.map((p) => [p.id, p])),
    wires: Object.fromEntries(wires.map((w) => [w.id, w])),
  });
}

/** A 2-D context that only counts calls. */
function countingContext(counts: Map<string, number>): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      if (key === "measureText") return () => ({ width: 10 });
      return (..._args: unknown[]) => void counts.set(key, (counts.get(key) ?? 0) + 1);
    },
    set(t, key: string, v) {
      t[key] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe("schematic render benchmark", () => {
  test("live and dots layers of a 150-part ladder", () => {
    const counts = new Map<string, number>();
    const ctx = countingContext(counts);
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
    const doc = ladderDocument();
    const compiled = compile(doc, createPartResolver());
    const access: ElementAccess = { getView, getDescriptor, terminalPositions, localToDocument };
    const scheduler = new RenderScheduler({ request: () => 0, cancel: () => {} });
    const r = new SchematicRenderer(document.createElement("div"), scheduler, access, lightTheme);
    r.resize(1600, 900, 1);
    r.setCircuit(doc, compiled);
    const display = new Float64Array(compiled.netlist.nodeCount + 1 + 4 * compiled.netlist.elements.length);
    for (let i = 0; i < display.length; i++) display[i] = Math.sin(i) * 1e-3;
    r.setDisplay(display, 0);
    r.setRunning(true);
    r.animator.tick(0.016, 0);
    const draw = (layer: string) => (r as unknown as { drawLayer(l: string): void }).drawLayer(layer);

    const calls = (layer: string): Record<string, number> => {
      counts.clear();
      draw(layer);
      return Object.fromEntries(counts);
    };
    const perFrameMs = (layer: string, frames: number): number => {
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) draw(layer);
      return (performance.now() - t0) / frames;
    };
    const parts = Object.keys(doc.parts).length;
    const report = (layer: string, label = layer) => {
      const c = calls(layer);
      const drawCalls = (c.stroke ?? 0) + (c.fill ?? 0) + (c.fillRect ?? 0) + (c.fillText ?? 0);
      const pathCalls = (c.moveTo ?? 0) + (c.lineTo ?? 0) + (c.arc ?? 0);
      console.log(`[render] ${parts} parts, ${label}: ${drawCalls} draw calls, ${pathCalls} path calls, ${perFrameMs(layer, 50).toFixed(3)} ms/frame`);
      return drawCalls;
    };
    // Symbols without Path2D (plain jsdom) are drawn directly every time...
    expect(report("symbols", "symbols (direct)")).toBeGreaterThan(0);
    // ...and with Path2D, replayed from the per-type cache (paths built once).
    (globalThis as { Path2D?: unknown }).Path2D = class {
      moveTo() {}
      lineTo() {}
      arc() {}
      closePath() {}
    };
    calls("symbols"); // fill the cache
    expect(report("symbols", "symbols (Path2D cache)")).toBeGreaterThan(0);
    delete (globalThis as { Path2D?: unknown }).Path2D;
    // Live and dots layers redraw every frame: one path per node / one for all dots.
    expect(report("live")).toBeLessThan(2 * compiled.netlist.nodeCount + 4);
    expect(report("dots")).toBeLessThanOrEqual(2);
    r.dispose();
  });
});
