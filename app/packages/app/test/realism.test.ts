// @vitest-environment jsdom
import { getModelFactory } from "@cs/elements/models";
import { getDescriptor, RATINGS } from "@cs/elements";
import { createDocument, terminalCurrentOffsets, type CircuitDocument } from "@cs/model";
import { EngineHost, type Command, type WorkerMessage } from "@cs/worker";
import { AppController } from "../src/controller";
import type { WorkerPort } from "../src/sim/sim-client";
import { applyRealisticParts } from "../src/realism/realistic-parts";
import { defaultProps } from "../src/tools/route";
import { failureMessage, ledResistor, overRatingMessage } from "../src/realism/notes";
import { failedParts, repairParts } from "../src/realism/repair";
import { highestFrequency, reversalsPerSecond, slowSpeedFor } from "../src/realism/ac-notice";
import { printMarkup } from "../src/export/print";
import { schematicSvg } from "../src/export/image";
import { addMessages, t } from "../src/messages";
import { REALISM_EN } from "../src/realism/messages-en";

beforeAll(() => addMessages(REALISM_EN));

function inProcessWorker() {
  let now = 0;
  const tasks: { at: number; fn: () => void }[] = [];
  const schedule = (fn: () => void, delayMs: number) => tasks.push({ at: now + Math.max(0, delayMs), fn });
  let port!: WorkerPort;
  const host = new EngineHost({
    now: () => now,
    schedule,
    post: (msg: WorkerMessage) => schedule(() => port.onmessage?.({ data: msg } as MessageEvent<WorkerMessage>), 0),
    getModelFactory,
  });
  port = { postMessage: (cmd: Command) => schedule(() => host.handle(structuredClone(cmd)), 0), onmessage: null };
  const advance = (ms: number) => {
    const end = now + ms;
    for (let guard = 0; guard < 1e6; guard++) {
      tasks.sort((a, b) => a.at - b.at);
      const task = tasks[0];
      if (!task || task.at > end) break;
      tasks.shift();
      now = Math.max(now, task.at);
      task.fn();
    }
    now = end;
  };
  return { port, advance };
}

/** 12 V battery across a 100 Ω, 1/4 W resistor: 1.44 W. */
function hotResistor(realisticRatings = true): CircuitDocument {
  return createDocument({
    meta: { title: "Hot resistor", description: "A resistor that is too small." },
    settings: { realisticParts: false, realisticRatings, start: "zero", seed: 1 },
    parts: {
      B1: { id: "B1", type: "battery", label: "B1", at: { x: 0, y: 0 }, orientation: { rot: 0, flip: false }, length: 4, props: { voltage: 12, internalResistance: 0 } },
      R1: { id: "R1", type: "resistor", label: "R1", at: { x: 0, y: 6 }, orientation: { rot: 0, flip: false }, length: 4, props: { resistance: 100 } },
      G1: { id: "G1", type: "ground", label: "", at: { x: 4, y: 6 }, orientation: { rot: 0, flip: false }, props: {} },
    },
    wires: {
      w1: { id: "w1", points: [{ x: 0, y: 0 }, { x: 0, y: 6 }] },
      w2: { id: "w2", points: [{ x: 4, y: 0 }, { x: 4, y: 6 }] },
    },
  });
}

/** Current through R1 in the latest frame. */
function currentR1(c: AppController): number {
  const cc = c.compiled!;
  const i = cc.netlist.elements.findIndex((e) => e.id === "R1");
  const f = c.bus.latest!;
  return f.display[cc.netlist.nodeCount + 1 + terminalCurrentOffsets(cc.netlist)[i]];
}

describe("realistic parts (RLM-01)", () => {
  it("swaps defaults both ways and leaves hand-set values alone", () => {
    const doc = hotResistor();
    doc.parts.S1 = { id: "S1", type: "switch", label: "S1", at: { x: 10, y: 0 }, orientation: { rot: 0, flip: false }, props: { closed: true, onResistance: 0 } };
    doc.parts.S2 = { id: "S2", type: "switch", label: "S2", at: { x: 10, y: 4 }, orientation: { rot: 0, flip: false }, props: { closed: true, onResistance: 2 } };
    applyRealisticParts(doc, true);
    expect(doc.parts.B1.props.internalResistance).toBe(0.5);
    expect(doc.parts.S1.props.onResistance).toBe(0.05);
    expect(doc.parts.S2.props.onResistance).toBe(2);
    applyRealisticParts(doc, false);
    expect(doc.parts.B1.props.internalResistance).toBe(0);
    expect(doc.parts.S1.props.onResistance).toBe(0);
  });

  it("new parts take realistic defaults when the setting is on", () => {
    const d = getDescriptor("battery")!;
    expect(defaultProps(d).internalResistance).toBe(0);
    expect(defaultProps(d, true).internalResistance).toBe(0.5);
    expect(defaultProps(getDescriptor("op-amp")!, true).maxOutput).toBe(13.5);
  });
});

describe("realism messages (RLM-05/06)", () => {
  it("explains an LED failure with numbers and the series resistor", () => {
    expect(ledResistor(9, "red")).toBe(360);
    const msg = failureMessage(
      { label: "D1", type: "led", props: { color: "red" }, spec: RATINGS.led[0], value: 0.087, rating: 0.02, duration: 0.4, supply: 9 },
      t,
    );
    expect(t(msg)).toBe("D1 failed: 87 mA flowed through it for 400 ms; its limit is 30 mA. Add a resistor in series. For a 9 V supply and a red LED, about 360 Ω gives 20 mA.");
  });

  it("warns with the dissipation and the rating", () => {
    expect(t(overRatingMessage("R1", RATINGS.resistor[0], 0.4, 0.25))).toBe("R1 is dissipating 400 mW; its rating is 250 mW.");
  });
});

describe("failure and repair through the app (RLM-06/07)", () => {
  it("a failure becomes an undoable document fact; Repair and Undo restore the part", () => {
    const w = inProcessWorker();
    const c = new AppController(hotResistor(), { worker: w.port });
    w.advance(100);
    c.commands.run("sim.runPause");
    w.advance(2500);
    expect(c.edits.doc.parts.R1.props.failed).toBe("open");
    expect(c.store.get().diagnostics.some((d) => d.id === "part-failed" && d.elements.includes("R1"))).toBe(true);
    c.commands.run("sim.runPause");
    w.advance(100);
    expect(Math.abs(currentR1(c))).toBeLessThan(1e-6);

    // Reset keeps the failure on screen.
    c.commands.run("sim.reset");
    w.advance(100);
    expect(c.edits.doc.parts.R1.props.failed).toBe("open");
    c.commands.run("sim.step");
    w.advance(100);
    expect(Math.abs(currentR1(c))).toBeLessThan(1e-6);

    // Repair all is one edit; current flows again.
    expect(c.commands.run("edit.repairAll")).toBe(true);
    expect(failedParts(c.edits.doc)).toEqual([]);
    c.commands.run("sim.step");
    w.advance(100);
    expect(currentR1(c)).toBeCloseTo(0.12, 3);

    // Undo the repair: failed again, in the document and the engine.
    c.commands.run("edit.undo");
    expect(c.edits.doc.parts.R1.props.failed).toBe("open");
    c.commands.run("sim.step");
    w.advance(100);
    expect(Math.abs(currentR1(c))).toBeLessThan(1e-6);

    // Undo the failure itself: repaired.
    c.commands.run("edit.undo");
    expect(c.edits.doc.parts.R1.props.failed).toBeUndefined();
    c.commands.run("sim.step");
    w.advance(100);
    expect(currentR1(c)).toBeCloseTo(0.12, 3);
    expect(c.store.get().diagnostics.some((d) => d.id === "part-failed")).toBe(false);
    c.dispose();
  });

  it("repairParts touches only failed parts", () => {
    const d = hotResistor();
    d.parts.R1.props.failed = "open";
    expect(repairParts(d, ["B1"])).toBe(0);
    expect(repairParts(d)).toBe(1);
    expect(d.parts.R1.props.failed).toBeUndefined();
  });
});

describe("AC slow-down notice (ANI-08)", () => {
  it("counts reversals per real second and proposes about two seconds per cycle", () => {
    const d = hotResistor();
    d.parts.V2 = { id: "V2", type: "ac-source", label: "V2", at: { x: 20, y: 0 }, orientation: { rot: 0, flip: false }, props: { amplitude: 5, frequency: 60 } };
    expect(highestFrequency(d)).toBe(60);
    expect(reversalsPerSecond(60, 1)).toBe(120);
    expect(slowSpeedFor(60, [1e-3, 1e-2, 0.1, 1])).toBe(1e-2);
  });
});

describe("export and print (FIL-11/12)", () => {
  it("exports well-formed SVG with every part, label and value", () => {
    const c = new AppController(hotResistor(), { worker: undefined });
    const svg = schematicSvg(c);
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(parsed.documentElement.nodeName).toBe("svg");
    expect(svg).toContain(">R1<");
    expect(svg).toContain(">100 Ω<");
    expect(svg).toContain("<title>Hot resistor</title>");
    c.dispose();
  });

  it("lays out a print page with title, description, schematic and chart", () => {
    const html = printMarkup("A & B", "Desc <x>", "<svg></svg>", "data:image/png;base64,AA");
    expect(html).toContain("<h1>A &amp; B</h1>");
    expect(html).toContain("Desc &lt;x&gt;");
    expect(html).toContain("<svg></svg>");
    expect(html).toContain('src="data:image/png;base64,AA"');
  });
});
