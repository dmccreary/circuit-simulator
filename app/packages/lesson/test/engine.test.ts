/// <reference types="vite/client" />
import ohmCircuit from "../../../public/lessons/circuits/ohms-law.circuit.json?raw";
import { compile, type CircuitDocument, type Part } from "@cs/model";
import { createPartResolver } from "@cs/elements";
import { parseCircuit } from "@cs/formats";
import {
  LessonEngine,
  applyFault,
  checkAgainstCircuit,
  checkDeps,
  evaluateCheck,
  loadLesson,
  pickFault,
  stepSnapshotYaml,
  type Check,
  type Lesson,
  type LessonContext,
  type ProgressStore,
  type LessonProgress,
  type Quantity,
} from "@cs/lesson";

const resolver = createPartResolver();
const ohmDoc = (): CircuitDocument => parseCircuit(ohmCircuit).doc;

function ctxFor(doc: CircuitDocument, over: Partial<LessonContext> & { values?: Record<string, number> } = {}): LessonContext {
  const values = over.values ?? {};
  return {
    doc,
    compiled: compile(doc, resolver),
    terminals: (p: Part) => resolver.terminals(p),
    partValue: (id: string, q: Quantity) => values[`${id}.${q}`],
    probeValue: (id: string) => values[`probe.${id}`],
    measure: (id: string, kind: string) => values[`${id}.${kind}`],
    diagnostics: [],
    simTime: 0,
    runState: "paused",
    ...over,
  };
}

function lesson(yaml: string): Lesson {
  const r = loadLesson(yaml);
  if (!r.lesson) throw new Error(r.problems.map((p) => p.message).join("\n"));
  return r.lesson;
}

describe("checks (LES-06)", () => {
  const doc = ohmDoc();
  const c = ctxFor(doc, { values: { "A1.current": 0.005, "probe.P1": 5, "P1.rms": 5 }, simTime: 0.5, runState: "running", diagnostics: [{ id: "no-ground", elements: [] }] });
  const yes: Check[] = [
    { part: { type: "resistor", label: "R1" } },
    { part: { type: "capacitor", exists: false } },
    { property: { part: "R1", prop: "resistance", equals: "1k", tolerance: "1%" } },
    { property: { part: "V1", prop: "voltage", within: [4, 6] } },
    { connected: { a: "R1.2", b: "GND" } },
    { connected: { a: "A1.2", b: "R1.1" } },
    { connected: { a: "R1.1", b: "GND", connected: false } },
    { probe: { quantity: "voltage", part: "R1" } },
    { probe: { quantity: "current", part: "R1" } },
    { probe: { quantity: "logic", exists: false } },
    { value: { of: { part: "A1", quantity: "current" }, equals: "5 mA", tolerance: "2%" } },
    { value: { of: { probe: "V(R1)" }, above: 4.9 } },
    { measurement: { probe: "V(R1)", kind: "rms", equals: 5, tolerance: 0.01 } },
    { diagnostic: { id: "no-ground" } },
    { diagnostic: { id: "ammeter-in-parallel", present: false } },
    { "sim-time": "0.5 s" },
    { "run-state": "running" },
    { all: [{ part: { label: "A1" } }, { not: { part: { label: "Z9" } } }] },
    { any: [{ part: { label: "Z9" } }, { part: { label: "V1" } }] },
  ];
  test.each(yes.map((x) => [JSON.stringify(x), x] as const))("%s holds", (_n, check) => {
    expect(evaluateCheck(check, c)).toBe(true);
  });
  const no: Check[] = [
    { property: { part: "R1", prop: "resistance", equals: 2000, tolerance: "2%" } },
    { value: { of: { part: "A1", quantity: "current" }, equals: "5.2 mA", tolerance: "2%" } },
    { "sim-time": "1 s" },
    { switch: { part: "R1", closed: true } },
    { connected: { a: "R1.1", b: "GND" } },
  ];
  test.each(no.map((x) => [JSON.stringify(x), x] as const))("%s does not hold", (_n, check) => {
    expect(evaluateCheck(check, c)).toBe(false);
  });

  test("dependencies limit re-evaluation to patches or frames (LES-08)", () => {
    expect([...checkDeps({ property: { part: "R1", prop: "r", equals: 1 } })]).toEqual(["doc"]);
    expect([...checkDeps({ all: [{ "sim-time": 1 }, { diagnostic: { id: "x" } }] })].sort()).toEqual(["diagnostics", "doc", "frame"]);
  });

  test("the lesson is checked against its circuit (LES-16)", () => {
    const l = lesson(`lesson: x
title: X
permissions: { locked: [R1, R7] }
steps:
  - read: a
    spotlight: [Q3, "command:sim.runPause"]
  - troubleshoot: { faults: ["R9 open"] }
`);
    const problems = checkAgainstCircuit(l, doc);
    expect(problems.map((p) => p.severity)).toEqual(["warning", "warning", "error"]);
    expect(problems[2].message).toContain("R9");
  });
});

describe("step machine (§4.2)", () => {
  const yaml = `lesson: m
title: M
steps:
  - read: Intro
  - id: p
    predict-number: { prompt: "Guess", unit: A, blind: [readouts] }
  - do:
      prompt: Set R1 to 2k
      check: { property: { part: R1, prop: resistance, equals: 2k } }
      success: Nice
    hints: [one, two]
    feedback:
      - when: { property: { part: R1, prop: resistance, above: 5k } }
        say: Too big
      - diagnostic: no-ground
        say: Add a ground
  - observe: { run-for: 1 s, compare-with: p, show: { part: A1, quantity: current }, unit: A }
  - measure: { prompt: Read A1, value: { part: A1, quantity: current }, tolerance: 2% }
  - explain: { prompt: Why? }
`;

  test("transitions, effects, hints, feedback, answers and summary", () => {
    const doc = ohmDoc();
    const e = new LessonEngine(lesson(yaml), { learnerId: "u1", now: () => 1000 });
    const events: string[] = [];
    e.on((ev) => ev.type !== "change" && events.push(ev.type));

    expect(e.step).toEqual({ index: 0, count: 6, status: "complete" }); // read is complete on entry
    expect(e.canBack).toBe(false);
    expect(e.next()).toBe(true);

    // Predict: blind, run locked, Next disabled until submitted (LES-03).
    expect(e.effects()).toMatchObject({ blind: ["readouts"], runLocked: true });
    expect(e.canNext).toBe(false);
    expect(e.submit({ number: Number.NaN }).ok).toBe(false);
    expect(e.submit({ number: 0.0025, text: "2.5 mA" }).ok).toBe(true);
    expect(e.effects()).toMatchObject({ blind: [], runLocked: false });
    e.next();

    // Do: completes only when the check holds; feedback from checks and diagnostics.
    const big = { ...doc, parts: { ...doc.parts, R1: { ...doc.parts.R1, props: { resistance: 10e3 } } } };
    e.evaluate(ctxFor(big, { diagnostics: [{ id: "no-ground", elements: [] }] }), "enter");
    expect(e.feedback).toBe("Too big");
    expect(e.complete).toBe(false);
    expect(e.revealHint()).toBe("one");
    expect(e.revealHint()).toBe("two");
    expect(e.revealHint()).toBeUndefined();
    // A frame does not re-run doc checks.
    const right = { ...doc, parts: { ...doc.parts, R1: { ...doc.parts.R1, props: { resistance: 2000 } } } };
    e.evaluate(ctxFor(right), "frame");
    expect(e.complete).toBe(false);
    e.evaluate(ctxFor(right), "doc");
    expect(e.complete).toBe(true);
    expect(e.message?.text).toBe("Nice");
    expect(e.feedback).toBeUndefined();
    e.next();

    // Observe: completes after run-for of simulated time, recording the value shown.
    e.evaluate(ctxFor(doc, { simTime: 0, values: { "A1.current": 0.001 } }), "enter");
    e.evaluate(ctxFor(doc, { simTime: 0.6, values: { "A1.current": 0.0024 } }), "frame");
    expect(e.complete).toBe(false);
    e.evaluate(ctxFor(doc, { simTime: 1.0, values: { "A1.current": 0.0025 } }), "frame");
    expect(e.complete).toBe(true);
    expect(e.comparison(3)).toEqual({ predicted: "2.5 mA", observed: 0.0025, unit: "A" });
    e.next();

    // Measure: within tolerance of the live reading.
    const live = ctxFor(doc, { values: { "A1.current": -0.005 } });
    expect(e.submit({ number: 0.0052 }, live).ok).toBe(false);
    expect(e.record().attempts).toBe(1);
    expect(e.submit({ number: 0.00501 }, live).ok).toBe(true);
    e.next();

    expect(e.submit({ text: "  " }).ok).toBe(false);
    expect(e.submit({ text: "Because V = IR" }).ok).toBe(true);
    expect(e.next()).toBe(true);
    expect(e.isFinished).toBe(true);

    const sum = e.summary();
    expect(sum).toMatchObject({ done: 6, count: 6, hints: 2 });
    expect(sum.predictions[0]).toMatchObject({ predicted: "2.5 mA", actual: "2.5 mA" });
    expect(events).toContain("finished");
    expect(events.filter((x) => x === "hint")).toHaveLength(2);

    // Back, and restart a step.
    expect(e.back()).toBe(true);
    e.restartStep();
    expect(e.complete).toBe(false);
  });

  test("progress round-trips and resumes (LES-13)", async () => {
    const l = lesson(yaml);
    const e = new LessonEngine(l, { learnerId: "u1" });
    e.next();
    e.submit({ number: 1 });
    const saved = new Map<string, unknown>();
    const store: ProgressStore = {
      load: async (k) => saved.get(k),
      save: async (k, p) => void saved.set(k, structuredClone(p)),
      clear: async (k) => void saved.delete(k),
    };
    await store.save("page|m", e.progress());
    const resumed = new LessonEngine(l, { learnerId: "u1", progress: await store.load("page|m") });
    expect(resumed.index).toBe(1);
    expect(resumed.record().answer).toEqual({ number: 1 });
    // Progress from a different lesson (or a changed one) is ignored.
    const other = { ...(saved.get("page|m") as LessonProgress), stepCount: 3 };
    expect(new LessonEngine(l, { learnerId: "u1", progress: other }).index).toBe(0);
  });
});

describe("random faults (LES-07)", () => {
  const faults = [
    { part: "R1", kind: "open" as const },
    { part: "A1", kind: "short" as const },
    { part: "R1", kind: "value" as const, props: { resistance: "100k" } },
  ];
  test("seeded by learner and lesson: reproducible, and varied across learners", () => {
    expect(pickFault(faults, "alice", "l", 2)).toBe(pickFault(faults, "alice", "l", 2));
    const picks = new Set(Array.from({ length: 40 }, (_, i) => pickFault(faults, `learner-${i}`, "l", 2)));
    expect(picks.size).toBe(3);
  });

  test("faults are an overlay; the document itself is unchanged", () => {
    const doc = ohmDoc();
    const terms = (p: Part) => resolver.terminals(p);
    const open = applyFault(doc, faults[0], terms);
    expect(open.parts.R1).toBeUndefined();
    expect(doc.parts.R1).toBeDefined();
    const short = applyFault(doc, faults[1], terms);
    expect(short.parts.A1).toBeUndefined();
    expect(Object.keys(short.wires)).toContain("fault-A1");
    expect(compile(short, resolver).diagnostics.map((d) => d.id)).not.toContain("open-terminal");
    expect(applyFault(doc, faults[2], terms).parts.R1.props.resistance).toBeCloseTo(100e3);
  });

  test("troubleshoot completes on the faulty part and records wrong clicks", () => {
    const l = lesson(`lesson: t
title: T
steps:
  - troubleshoot: { prompt: Find it, faults: ["R1 open", "A1 short"] }
`);
    const e = new LessonEngine(l, { learnerId: "bob" });
    const fault = e.activeFault()!;
    expect(e.effects().fault).toEqual(fault);
    const wrong = fault.part === "R1" ? "A1" : "R1";
    const c = ctxFor(ohmDoc());
    expect(e.submit({ part: wrong }, c).ok).toBe(false);
    expect(e.record().wrong).toEqual([wrong]);
    expect(e.submit({ part: fault.part }, c).ok).toBe(true);
  });
});

describe("author mode", () => {
  test("a step snapshot is a valid do step that holds now", () => {
    const doc = ohmDoc();
    const yaml = stepSnapshotYaml(doc, ["R1"]);
    const l = lesson(`lesson: a\ntitle: A\nsteps:\n${yaml.replace(/^/gm, "  ")}`);
    const step = l.steps[0];
    expect(step.type).toBe("do");
    if (step.type === "do") expect(evaluateCheck(step.check, ctxFor(doc))).toBe(true);
  });
});
