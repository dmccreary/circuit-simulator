// @vitest-environment jsdom
// Spec §25 user stories about lessons, walked through the real
// AppController, EmbedRuntime, lesson session and xAPI reporter:
// 25.20 finding the fault, 25.21 a teacher builds a predict-observe-explain page.

import { XapiReporter, type Statement } from "@cs/xapi";
import type { LessonProgress, ProgressStore } from "@cs/lesson";
import { filesOf } from "../../packages/app/src/files/install";
import { EmbedRuntime } from "../../packages/app/src/embed/runtime";
import { parseEmbedParams } from "../../packages/app/src/embed/params";
import { attachXapi } from "../../packages/app/src/embed/xapi-hook";
import type { EmbedSession } from "../../packages/app/src/embed/start";
import type { HostBridge } from "../../packages/app/src/embed/bridge";
import { lessonContext, startLesson } from "../../packages/app/src/lesson";
import { Story, type PartSpec } from "../helpers/app";

const PAGE = "http://localhost/simulator/index.html";

function memoryProgress(): ProgressStore {
  const saved = new Map<string, LessonProgress>();
  return { load: async (k) => saved.get(k), save: async (k, p) => void saved.set(k, structuredClone(p)), clear: async (k) => void saved.delete(k) };
}

/** Author the circuit in one session and save it as a file the lesson can load. */
function circuitFile(parts: PartSpec[], probes: (s: Story) => void = () => {}): string {
  const author = new Story();
  author.build(parts);
  probes(author);
  const text = filesOf(author.c).fileText();
  author.dispose();
  return text;
}

/** Open a lesson in an embedded simulator (`?lesson=…&xapi=1`), as a chapter page's iframe does. */
async function openLesson(name: string, yaml: string, circuitText: string, query = "") {
  const s = new Story();
  const config = parseEmbedParams(`?lesson=${name}&xapi=1${query}`, "", true);
  const runtime = new EmbedRuntime(s.c, config, { href: PAGE });
  const statements: Statement[] = [];
  // The statement queue's timers, fired by deliver().
  const timers: (() => void)[] = [];
  const scheduler = { now: () => Date.now(), setTimeout: (fn: () => void) => timers.push(fn), clearTimeout: () => {} };
  const reporter = new XapiReporter({
    allowed: config.xapi,
    context: { page: PAGE, embedId: config.id ?? "e1", circuitId: name, mode: "lesson" },
    relay: (st) => void statements.push(st),
    scheduler,
  });
  const deliver = async () => {
    for (let n = 0; n < 20; n++) {
      timers.splice(0).forEach((fn) => fn());
      await Promise.resolve();
    }
  };
  const posts: { type: string; payload: Record<string, unknown> }[] = [];
  const embed = {
    config,
    runtime,
    reporter,
    bridge: { post: (type: string, payload: Record<string, unknown>) => posts.push({ type, payload }) } as unknown as HostBridge,
    dispose() {},
  } as EmbedSession;
  const off = attachXapi(runtime, reporter);
  const files: Record<string, string> = {
    [`/simulator/lessons/${name}.yaml`]: yaml,
    [`/simulator/lessons/circuits/${name}.circuit.json`]: circuitText,
  };
  const fetchText = async (url: string) => {
    const t = files[new URL(url).pathname];
    if (t === undefined) throw new Error(`404 ${url}`);
    return t;
  };
  const status = await startLesson(s.c, name, { embed, pageHref: PAGE, page: PAGE, fetchText, store: memoryProgress(), learner: "student-1" });
  if (status.kind !== "ready") throw new Error(JSON.stringify(status));
  s.advance(50);
  return { s, runtime, reporter, statements, deliver, posts, session: status.session, off };
}

const verbs = (sts: Statement[]) => sts.map((x) => x.verb.display["en-US"]);

describe("story 25.20: finding the fault", () => {
  // Four resistors in series across a 12 V supply (switch closed). One is secretly open.
  const parts: PartSpec[] = [
    { label: "V1", type: "battery", props: { voltage: 12 }, nodes: [1, 0] },
    { label: "S1", type: "switch", props: { closed: true }, nodes: [1, 2] },
    { label: "R1", type: "resistor", props: { resistance: 1000 }, nodes: [2, 3] },
    { label: "R2", type: "resistor", props: { resistance: 1000 }, nodes: [3, 4] },
    { label: "R3", type: "resistor", props: { resistance: 1000 }, nodes: [4, 5] },
    { label: "R4", type: "resistor", props: { resistance: 1000 }, nodes: [5, 0] },
  ];
  const yaml = `lesson: find-fault
title: Finding the fault
circuit: circuits/find-fault.circuit.json
permissions:
  edit: none
  palette: []
  tools: [select]
  locked: all
  panels: [status]
steps:
  - id: find
    troubleshoot:
      prompt: One resistor is open. Measure across each resistor, then click the faulty one.
      faults: ["R1 open", "R2 open", "R3 open", "R4 open"]
`;

  test("the chart, probes and palette are hidden; the open resistor takes the full 12 V; clicking it completes the step (LES-02, LES-06, LES-11)", async () => {
    const { s, runtime, session, statements } = await openLesson("find-fault", yaml, circuitFile(parts));
    expect(runtime.caps.panels).not.toContain("chart");
    expect(runtime.caps.panels).not.toContain("palette");
    const fault = session.engine.activeFault()!;
    expect(["R1", "R2", "R3", "R4"]).toContain(fault.part);
    // The fault lives only in what the compiler sees: the document still shows four good resistors.
    for (const r of ["R1", "R2", "R3", "R4"]) expect(Object.values(s.doc.parts).find((p) => p.label === r)?.props.resistance).toBe(1000);
    s.run(100);
    // A voltmeter across each resistor reads the difference of its two terminals' node voltages.
    const cc = s.c.compiled!;
    const d = s.display;
    const across = ["R1", "R2", "R3", "R4"].map((r) => {
      const part = Object.values(s.doc.parts).find((p) => p.label === r)!;
      const [a, b] = s.terminals(part.id).map((pt) => cc.pointToNode.get(`${pt.x},${pt.y}`)!);
      return Math.abs((a ? d[a] : 0) - (b ? d[b] : 0));
    });
    expect(lessonContext(s.c).simTime).toBeGreaterThan(0);
    across.forEach((v, k) => expect(v).toBeCloseTo(["R1", "R2", "R3", "R4"][k] === fault.part ? 12 : 0, 3));
    // The student clicks a resistor with the Select tool and submits the selection.
    const pick = (label: string) => {
      const part = Object.values(s.doc.parts).find((p) => p.label === label)!;
      const [a, b] = s.terminals(part.id);
      s.tool({ id: "select" });
      s.click({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      expect(s.c.selectedParts()).toEqual([part.id]);
      session.submitSelection();
    };
    const wrong = fault.part === "R1" ? "R2" : "R1";
    pick(wrong);
    expect(session.engine.complete).toBe(false);
    expect(session.engine.record().wrong).toEqual([wrong]);
    pick(fault.part);
    expect(session.engine.complete).toBe(true);
    void statements;
  });

  test.todo("PRB-24: the multimeter on ohms across a powered circuit shows '– – –' and asks to turn the power off; with the supply switch open it reads 'OL' across the open resistor");
  test.todo("RLM-04: with realistic ratings, the meter on amps straight across the supply blows its fuse and the lesson explains why ammeters go in series");
});

describe("story 25.21: a teacher builds a predict-observe-explain page", () => {
  const parts: PartSpec[] = [
    { label: "V1", type: "battery", props: { voltage: 10 }, nodes: [1, 0] },
    { label: "S1", type: "switch", props: { closed: false }, nodes: [1, 2] },
    { label: "R1", type: "resistor", props: { resistance: 10e3 }, nodes: [2, 3] },
    { label: "C1", type: "capacitor", props: { capacitance: 100e-6 }, nodes: [3, 0] },
  ];
  // Every part locked except the switch, no palette, chart only from step 2.
  const yaml = `lesson: poe-rc
title: Charging a capacitor
circuit: circuits/poe-rc.circuit.json
permissions:
  edit: values
  palette: []
  tools: [select]
  locked: [V1, R1, C1]
steps:
  - id: predict
    predict-number:
      prompt: What will the capacitor voltage be one second after the switch closes?
      unit: V
      blind: [readouts, traces]
  - observe:
      prompt: Close the switch and watch.
      run-for: 1 s
      compare-with: predict
      show: { part: C1, quantity: voltage }
      unit: V
  - explain:
      prompt: Explain the difference between your prediction and the result.
      options:
        - The current falls as the capacitor charges.
        - The battery runs out.
`;

  test("locks, hidden palette, chart hidden until step 2, prediction compared with the real curve, xAPI statements with the host's identity (LES-01, LES-03, LES-04, EMB-02, XAP-01, XAP-04, XAP-07)", async () => {
    const circuit = circuitFile(parts, (a) => a.probe("probe-v", a.stubMid("C1", 0)));
    const { s, runtime, reporter, session, statements, deliver } = await openLesson("poe-rc", yaml, circuit, "&id=ch5-rc");
    // The chapter page's script turns on xAPI and sends the student's identity (XAP-01, XAP-04).
    const actor = { objectType: "Agent" as const, account: { homePage: "https://lms.example.org", name: "okafor-p3-07" } };
    expect(reporter.configure({ transport: "relay", actor })).toBe(true);
    await deliver();
    expect(statements[0].actor).toEqual(actor);
    // Locks and panels (LES-01, EMB-02).
    expect([...runtime.caps.lockedParts].sort()).toEqual(["C1", "R1", "V1"]);
    expect(runtime.caps.panels).not.toContain("palette");
    expect(runtime.caps.panels).not.toContain("chart"); // blind traces while predicting
    expect(s.c.commands.run("sim.runPause")).toBe(false); // Run waits for the prediction (LES-03)
    session.submit({ number: 10, text: "10 V" });
    session.next();
    expect(runtime.caps.panels).toContain("chart");
    // Close the only unlocked part, the switch, and run.
    const sw = Object.values(s.doc.parts).find((p) => p.label === "S1")!;
    s.c.edits.edit({ key: "edit.toggle" }, (d) => void (d.parts[sw.id].props.closed = true));
    expect(s.doc.parts[sw.id].props.closed).toBe(true);
    const r1 = Object.values(s.doc.parts).find((p) => p.label === "R1")!;
    s.c.edits.edit({ key: "t" }, (d) => void (d.parts[r1.id].props.resistance = 1));
    expect(s.doc.parts[r1.id].props.resistance).toBe(10e3); // locked: reverted
    s.c.setSpeed(1);
    s.run(1500);
    expect(session.engine.complete).toBe(true);
    const cmp = session.engine.comparison()!;
    expect(cmp.predicted).toBe("10 V");
    expect(cmp.observed!).toBeGreaterThan(6.0);
    expect(cmp.observed!).toBeLessThan(6.7);
    session.next();
    session.submit({ choice: 0 });
    reporter.terminate(1000);
    await deliver();
    // Statements carry stable activity ids for the embed (XAP-07).
    const v = verbs(statements);
    expect(v).toEqual(expect.arrayContaining(["launched", "initialized", "answered"]));
    expect(statements.every((st) => st.actor.account?.name === "okafor-p3-07")).toBe(true);
    expect(statements.some((st) => st.object.id.includes("#circuit-simulator/ch5-rc/"))).toBe(true);
  });

  test.todo("LES-15: Author mode writes the three steps from the running simulator (step snapshots)");
  test.todo("LES-05: students sketch a prediction on the chart; in step 2 each sketch appears dashed beside the real curve");
  test.todo("XAP-07: sketch shapes reach the learning record store so the teacher can count straight-line predictions");
});
