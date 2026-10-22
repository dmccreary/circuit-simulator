// @vitest-environment jsdom
/// <reference types="vite/client" />
import ohmsLaw from "../../../public/lessons/ohms-law.yaml?raw";
import ohmsLawCircuit from "../../../public/lessons/circuits/ohms-law.circuit.json?raw";
import rcCharging from "../../../public/lessons/rc-charging.yaml?raw";
import rcCircuitText from "../../../public/lessons/circuits/rc-charging.circuit.json?raw";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getModelFactory } from "@cs/elements/models";
import { EngineHost, type Command, type WorkerMessage } from "@cs/worker";
import { XapiReporter } from "@cs/xapi";
import type { LessonProgress, ProgressStore } from "@cs/lesson";
import { AppController } from "../src/controller";
import { rcChargingCircuit } from "../src/demo-circuit";
import { ControllerContext } from "../src/ui/context";
import { EmbedRuntime } from "../src/embed/runtime";
import { parseEmbedParams } from "../src/embed/params";
import type { EmbedSession } from "../src/embed/start";
import type { HostBridge } from "../src/embed/bridge";
import type { WorkerPort } from "../src/sim/sim-client";
import { lessonContext, lessonOf, resolveLessonUrl, startLesson, type LessonSession } from "../src/lesson";
import { LessonPanel } from "../src/lesson/LessonPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE = "http://localhost/simulator/index.html";
const FILES: Record<string, string> = {
  "/simulator/lessons/ohms-law.yaml": ohmsLaw,
  "/simulator/lessons/circuits/ohms-law.circuit.json": ohmsLawCircuit,
  "/simulator/lessons/rc-charging.yaml": rcCharging,
  "/simulator/lessons/circuits/rc-charging.circuit.json": rcCircuitText,
};
const fetchText = async (url: string) => {
  const text = FILES[new URL(url).pathname];
  if (text === undefined) throw new Error(`404 ${url}`);
  return text;
};

/** The real engine in-process on a virtual clock (as in end-to-end.test.ts). */
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
      const t = tasks[0];
      if (!t || t.at > end) break;
      tasks.shift();
      now = Math.max(now, t.at);
      t.fn();
    }
    now = end;
  };
  return { port, advance };
}

function fakeStore() {
  const saved = new Map<string, LessonProgress>();
  const store: ProgressStore = {
    load: async (k) => saved.get(k),
    save: async (k, p) => void saved.set(k, structuredClone(p)),
    clear: async (k) => void saved.delete(k),
  };
  return { saved, store };
}

async function setup(lesson: string) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  const w = inProcessWorker();
  const c = new AppController(rcChargingCircuit(), { worker: w.port });
  const config = parseEmbedParams(`?lesson=${lesson}`);
  const runtime = new EmbedRuntime(c, config, { href: PAGE });
  const posts: { type: string; payload: Record<string, unknown> }[] = [];
  const reporter = new XapiReporter({ allowed: true, context: { page: PAGE, embedId: "e1", circuitId: "default", mode: "lesson" }, relay: () => {} });
  reporter.configure({ transport: "relay" });
  const recorded: string[] = [];
  const origRecord = reporter.record.bind(reporter);
  reporter.record = (make) => {
    recorded.push(make(reporter.builder).verb.display["en-US"]);
    origRecord(make);
  };
  const embed = {
    config,
    runtime,
    reporter,
    bridge: { post: (type: string, payload: Record<string, unknown>) => posts.push({ type, payload }) } as unknown as HostBridge,
    dispose() {},
  } as EmbedSession;
  const { saved, store } = fakeStore();
  const status = await startLesson(c, lesson, { embed, pageHref: PAGE, page: PAGE, fetchText, store, learner: "t1" });
  if (status.kind !== "ready") throw new Error(JSON.stringify(status));
  /** Advance the virtual worker clock and the lesson's timers together. */
  const tick = (ms: number) => {
    for (let t = 0; t < ms; t += 20) {
      w.advance(20);
      vi.advanceTimersByTime(20);
    }
  };
  return { c, runtime, session: status.session, posts, recorded, saved, tick };
}

afterEach(() => vi.useRealTimers());

test("lesson names resolve to the lessons folder; scripts are refused", () => {
  expect(resolveLessonUrl("ohms-law", PAGE)).toBe("http://localhost/simulator/lessons/ohms-law.yaml");
  expect(resolveLessonUrl("rc-charging.yaml", PAGE)).toBe("http://localhost/simulator/lessons/rc-charging.yaml");
  expect(resolveLessonUrl("../course/l1.yaml", PAGE)).toBe("http://localhost/course/l1.yaml");
  expect(resolveLessonUrl("javascript:alert(1)", PAGE)).toBeUndefined();
});

test("a broken lesson file reports its problems instead of failing silently (LES-16)", async () => {
  const c = new AppController(rcChargingCircuit(), { worker: inProcessWorker().port });
  const s = await startLesson(c, "bad", { pageHref: PAGE, page: PAGE, fetchText: async () => "lesson: bad\ntitle: B\nsteps:\n  - wiggle: x\n", store: fakeStore().store });
  expect(s.kind).toBe("error");
  expect(lessonOf(c).get().status.kind).toBe("error");
  if (s.kind === "error") expect(s.problems[0]).toMatchObject({ line: 4, severity: "error" });
});

test("Ohm's law lesson end to end: capabilities, run lock, checks, measurements, progress, bridge and xAPI", async () => {
  const { c, runtime, session, posts, recorded, saved, tick } = await setup("ohms-law");
  const e = session.engine;
  expect(c.edits.doc.parts.A1?.type).toBe("ammeter");
  // Permissions from the lesson: values only, no palette, R1 and A1 locked.
  expect(runtime.caps.edit).toBe("values");
  expect(runtime.caps.panels).not.toContain("palette");
  expect(runtime.caps.lockedParts).toEqual(["R1", "A1"]);
  expect(session.spot.parts).toEqual(["R1", "A1"]);

  session.next(); // to Measure at 5 V
  session.submit({ number: 0.005 });
  expect(e.complete).toBe(false); // no reading before the circuit has run
  expect(c.commands.run("sim.runPause")).toBe(true);
  tick(300);
  expect(lessonContext(c).probeValue("P2")).toBeCloseTo(0.005, 5); // the I(R1) flag
  session.submit({ number: 0.0052 });
  expect(e.complete).toBe(false);
  session.submit({ number: 0.005 });
  expect(e.complete).toBe(true);
  session.next(); // Predict at 10 V

  expect(c.store.get().runState).toBe("paused"); // a pending prediction pauses and locks Run (LES-03)
  expect(c.commands.run("sim.runPause")).toBe(false);
  expect(runtime.caps.panels).not.toContain("chart"); // blind: traces
  session.submit({ number: 0.01, text: "10 mA" });
  expect(c.commands.allowed("sim.runPause")).toBe(true);
  session.next(); // Do: set V1 to 10 V

  // A locked part cannot be changed; the change is reverted.
  c.edits.edit({ key: "t" }, (d) => void (d.parts.R1.props.resistance = 5));
  expect(c.edits.doc.parts.R1.props.resistance).toBe(1000);
  expect(e.complete).toBe(false);
  c.edits.edit({ key: "t" }, (d) => void (d.parts.V1.props.voltage = 10));
  expect(e.complete).toBe(true); // the check passes the moment the change is made (LES-08)
  expect(e.message?.text).toBe("V1 is now 10 V.");
  session.next(); // Observe

  c.commands.run("sim.runPause");
  tick(600);
  expect(e.complete).toBe(true);
  expect(c.store.get().runState).toBe("paused");
  const cmp = e.comparison()!;
  expect(cmp.predicted).toBe("10 mA");
  expect(cmp.observed).toBeCloseTo(0.01, 4);
  session.next(); // Measure at 10 V
  session.submit({ number: 0.01 });
  expect(e.complete).toBe(true);

  // Progress is saved after every step (LES-13), and the host hears about it.
  const key = [...saved.keys()][0];
  expect(key).toContain("ohms-law");
  expect(saved.get(key)!.index).toBe(5);
  expect(posts.filter((p) => p.type === "lessonProgress").at(-1)!.payload).toMatchObject({ lessonId: "ohms-law", step: 6, of: 9, status: "complete" });
  expect(recorded).toEqual(expect.arrayContaining(["attempted", "answered", "progressed"]));
  session.dispose();
  c.dispose();
});

test("Reset step restores the circuit as the step began, as one undoable change (LES-12)", async () => {
  const { c, session } = await setup("ohms-law");
  session.next();
  session.next();
  session.submit({ number: 0.01 });
  session.next(); // Do: V1 editable
  c.edits.edit({ key: "t" }, (d) => void (d.parts.V1.props.voltage = 7));
  expect(c.edits.doc.parts.V1.props.voltage).toBe(7);
  session.resetStep();
  expect(c.edits.doc.parts.V1.props.voltage).toBe(5);
  c.commands.run("edit.undo");
  expect(c.edits.doc.parts.V1.props.voltage).toBe(7);
  session.dispose();
  c.dispose();
});

test("RC lesson: the observe step stops near one time constant and the 63% check passes", async () => {
  const { c, session, tick } = await setup("rc-charging");
  const e = session.engine;
  session.next();
  session.submit({ number: 6.3, text: "6.3 V" });
  session.next(); // Observe 1 s
  c.commands.run("sim.runPause");
  tick(1400);
  expect(e.complete).toBe(true);
  expect(e.comparison()!.observed!).toBeGreaterThan(6.0);
  expect(e.comparison()!.observed!).toBeLessThan(6.6);
  session.next(); // Do: ~63%
  session.check();
  expect(e.complete).toBe(true);
  session.dispose();
  c.dispose();
});

describe("lesson panel", () => {
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  });

  async function render(session: LessonSession, c: AppController) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <ControllerContext.Provider value={c}>
          <LessonPanel session={session} />
        </ControllerContext.Provider>,
      ),
    );
    return { host, root };
  }

  test("renders step n of N, Markdown text, hints, and the summary", async () => {
    const { c, session } = await setup("ohms-law");
    vi.useRealTimers();
    const { host, root } = await render(session, c);
    expect(host.textContent).toContain("Step 1 of 9");
    expect(host.querySelector(".lesson-step strong")?.textContent).toBe("V1");
    expect(host.querySelector(".lesson-step code")?.textContent).toBe("I = V / R");
    const next = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Next"))!;
    expect(next.disabled).toBe(false);

    await act(async () => session.next());
    expect(host.textContent).toContain("Step 2 of 9 · Measure");
    expect(host.querySelector("input")).not.toBeNull();
    expect([...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Next"))!.disabled).toBe(true);
    await act(async () => session.hint());
    expect(host.querySelector(".lesson-hints")?.textContent).toContain("I(R1) flag");
    // The Run button carries its command id, so it can be spotlighted.
    expect(session.spot.selectors).toEqual(['[data-command="sim.runPause"]']);

    // Jump to the end and finish: the summary lists predictions and hints (LES-14).
    await act(async () => {
      session.engine.goTo(8);
      session.submit({ choice: 0 });
      session.next();
    });
    expect(host.textContent).toContain("Lesson complete");
    expect(host.textContent).toMatch(/used 1 hint/);
    await act(async () => root.unmount());
    session.dispose();
    c.dispose();
  });
});
