// @vitest-environment jsdom
// Spec §26 "Acceptance Test Circuits", test 22 (PRF-01): a 150-part circuit
// animates at 30 frames per second or more on a 2020-era school laptop.
// That needs a real browser; this file runs the closest Node proxy.

import { createEngine } from "@cs/engine";
import { createPartResolver, getDescriptor, localToDocument, terminalPositions } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { getView } from "@cs/elements/views";
import { compile, createDocument, type CircuitDocument, type Part, type Wire } from "@cs/model";
import { RenderScheduler, SchematicRenderer, lightTheme, type ElementAccess } from "@cs/render";
import { ladderNetlist } from "../perf/ladder";
import { stubCanvas } from "../helpers/canvas";

const resolver = createPartResolver();

describe("§26 test 22: a 150-part circuit animates at 30 fps or more (proxy)", () => {
  // PROXY: PRF-01 is about a real browser on a 2020-era school laptop. In
  // Node we measure what one animation frame costs on this machine: the
  // engine steps the worker takes per frame plus redrawing the two layers
  // that change every frame (live voltages and current dots), and count the
  // canvas draw calls those layers issue (load-independent). The timing is
  // the best of several rounds, because the suite runs files in parallel; a
  // 2020 school laptop is taken to be 2× slower than this machine at its best.
  const FRAME_MS = 1000 / 30;
  const SLOWDOWN = 2;
  const STEPS_PER_FRAME = 4;
  const ROUNDS = 5;

  function ladderDocument(stages: number): CircuitDocument {
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
    for (let k = 0; k < stages; k++) {
      const x = 4 * k;
      parts.push(part(`R${k}`, "resistor", x, 0, 0, { resistance: 1000 }, 4));
      parts.push(part(`C${k}`, "capacitor", x + 4, 0, 90, { capacitance: 1e-6 }, 4));
      wires.push({ id: `w${k}`, points: [{ x, y: 4 }, { x: x + 4, y: 4 }] });
    }
    return createDocument({ parts: Object.fromEntries(parts.map((p) => [p.id, p])), wires: Object.fromEntries(wires.map((w) => [w.id, w])) });
  }

  const best = (round: () => number) => Math.min(...Array.from({ length: ROUNDS }, round));

  test("engine steps plus live and dots redraw fit in a 30 fps frame with 2× headroom; draw calls stay bounded", () => {
    // Engine: the generated 150-part RC/diode/transistor ladder.
    const nl = ladderNetlist(150);
    expect(nl.elements.length).toBeGreaterThanOrEqual(150);
    const e = createEngine(nl, getModelFactory);
    for (let i = 0; i < 50; i++) e.step(); // warm up
    const stepMs = best(() => {
      const s0 = performance.now();
      for (let i = 0; i < 100; i++) {
        if (!e.step().ok) throw new Error("step failed");
        e.drainSamples();
      }
      return (performance.now() - s0) / 100;
    });

    // Renderer: a 152-part schematic drawn into a 2-D context that counts calls.
    const counts = new Map<string, number>();
    const doc = ladderDocument(75);
    const compiled = compile(doc, resolver);
    stubCanvas(counts);
    const access: ElementAccess = { getView, getDescriptor, terminalPositions, localToDocument };
    const r = new SchematicRenderer(document.createElement("div"), new RenderScheduler({ request: () => 0, cancel: () => {} }), access, lightTheme);
    r.resize(1600, 900, 1);
    r.setCircuit(doc, compiled);
    const display = new Float64Array(compiled.netlist.nodeCount + 1 + 4 * compiled.netlist.elements.length).map((_, i) => Math.sin(i) * 1e-3);
    r.setDisplay(display, 0);
    r.setRunning(true);
    const draw = (layer: string) => (r as unknown as { drawLayer(l: string): void }).drawLayer(layer);
    for (let i = 0; i < 10; i++) (draw("live"), draw("dots"));
    counts.clear();
    r.animator.tick(FRAME_MS / 1000, 0);
    draw("live");
    draw("dots");
    const drawCalls = ["stroke", "fill", "fillRect", "fillText"].reduce((n, k) => n + (counts.get(k) ?? 0), 0);
    let t = 0;
    const drawMs = best(() => {
      const r0 = performance.now();
      for (let i = 0; i < 20; i++) {
        r.animator.tick(FRAME_MS / 1000, (t += FRAME_MS));
        draw("live");
        draw("dots");
      }
      return (performance.now() - r0) / 20;
    });
    r.dispose();

    const frameMs = STEPS_PER_FRAME * stepMs + drawMs;
    console.log(
      `[§26.22 proxy] ${nl.elements.length} parts: ${stepMs.toFixed(3)} ms/step, ${drawMs.toFixed(3)} ms live+dots draw ` +
        `(${drawCalls} draw calls), ${frameMs.toFixed(2)} ms/frame`,
    );
    // Bounded by the part count (a few calls per part for its live tint), never per dot or per sample.
    // (rendering.md §2.2 aims for one call per node; the live tints currently add ~5 per part.)
    expect(drawCalls).toBeLessThan(8 * Object.keys(doc.parts).length);
    expect(frameMs * SLOWDOWN).toBeLessThan(FRAME_MS);
  });

  test.todo("PRF-01 in a real browser: a 150-part circuit keeps ≥ 30 fps on the reference laptop (Playwright + requestAnimationFrame timing)");
});
