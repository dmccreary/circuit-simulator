// Binds the pure lesson engine to a running simulator: re-evaluation on patches
// and frames, capability changes per step, the Reset Step snapshot, hidden
// faults, spotlights, saved progress, host messages and xAPI.

import type { CircuitDocument, Part } from "@cs/model";
import type { SchematicRenderer } from "@cs/render";
import type { XapiReporter } from "@cs/xapi";
import { applyFault, type Answer, type EngineEvent, type LessonEngine, type LessonProblem, type ProgressStore, type Reason, type StepEffects } from "@cs/lesson";
import type { AppController } from "../controller";
import { createStore, type Store } from "../store";
import { granted, commandCapability, type Capabilities } from "../embed/capabilities";
import type { EmbedRuntime } from "../embed/runtime";
import { lessonCapabilities, RUN_COMMANDS } from "./caps";
import { lessonContext } from "./context";
import { spotlightDrawer, splitSpotlight } from "./spotlight";
import { reportLessonEvent } from "./xapi";

/** Frames re-evaluate checks at most ten times a second (§4.3). */
export const FRAME_EVAL_MS = 100;

export interface LessonSessionOptions {
  runtime?: EmbedRuntime;
  /** The host bridge's post, for `lessonProgress` messages. */
  post?: (type: "lessonProgress", payload: unknown) => void;
  reporter?: XapiReporter;
  store?: ProgressStore;
  /** Key of this lesson's progress record. */
  key: string;
  /** Warnings from loading (unknown labels and the like), for the author (LES-16). */
  problems?: LessonProblem[];
  /** The shell element that takes blind-mode classes. */
  shell?: () => Element | null;
  now?: () => number;
}

export interface LessonView {
  /** Bumped on every visible change; React re-renders on it. */
  version: number;
}

export class LessonSession {
  readonly view: Store<LessonView> = createStore<LessonView>({ version: 0 });
  readonly problems: LessonProblem[];
  /** Part labels and control selectors to spotlight now. */
  spot: { parts: string[]; selectors: string[] } = { parts: [], selectors: [] };
  private snapshot: CircuitDocument | undefined;
  private baseCaps: Capabilities | undefined;
  private faultKey: string | undefined;
  private lastFrameEval = -Infinity;
  private frameTimer: ReturnType<typeof setTimeout> | undefined;
  private overlayOn: SchematicRenderer | undefined;
  private offOverlay: (() => void) | undefined;
  private disposers: Array<() => void> = [];
  private now: () => number;

  constructor(
    readonly c: AppController,
    readonly engine: LessonEngine,
    private opts: LessonSessionOptions,
  ) {
    this.problems = opts.problems ?? [];
    this.now = opts.now ?? (() => Date.now());
    this.baseCaps = opts.runtime?.caps;
  }

  /** Subscribe to the simulator and enter the current step. */
  start(): void {
    const c = this.c;
    let diags = c.store.get().diagnostics;
    let run = c.store.get().runState;
    this.disposers.push(
      this.engine.on((ev) => this.onEvent(ev)),
      c.edits.onPatches((b) => {
        if (!b.provisional && b.source !== "cancel") this.evaluate("doc");
      }),
      c.store.subscribe(() => {
        const s = c.store.get();
        if (s.diagnostics !== diags) {
          diags = s.diagnostics;
          this.evaluate("diagnostics");
        }
        if (s.runState !== run) {
          run = s.runState;
          this.evaluate("frame");
        }
      }),
      c.bus.subscribe(() => this.onFrame()),
    );
    const poll = setInterval(() => this.syncOverlay(), 500);
    this.disposers.push(() => clearInterval(poll));
    this.enterStep();
    this.reportEvent({ type: "enter", index: this.engine.index });
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.offOverlay?.();
    if (this.frameTimer) clearTimeout(this.frameTimer);
    this.c.compileOverlay = undefined;
    this.setBlindClasses([]);
  }

  // ------------------------------------------------------------ learner actions

  next(): void {
    this.engine.next();
  }

  back(): void {
    this.engine.back();
  }

  hint(): void {
    this.engine.revealHint();
  }

  submit(answer: Answer): void {
    this.engine.submit(answer, lessonContext(this.c));
  }

  /** The Troubleshoot answer: the part the learner selected. */
  submitSelection(): void {
    const id = this.c.selectedParts()[0];
    const part = id ? this.c.edits.doc.parts[id] : undefined;
    if (!part) {
      this.engine.message = { text: "Select a part on the schematic first.", tone: "info" };
      this.bump();
      return;
    }
    this.submit({ part: part.label || part.id });
  }

  /** Check: evaluate every check of the step now and say so if it is not met yet. */
  check(): void {
    this.engine.evaluate(lessonContext(this.c), "enter");
    if (!this.engine.complete) this.engine.message = { text: "Not yet. Keep going, or ask for a hint.", tone: "info" };
    this.bump();
  }

  /** LES-12: restore the circuit as it was when the step began, as one undoable change. */
  resetStep(): void {
    const snap = this.snapshot;
    if (!snap) return;
    const c = this.c;
    c.pause();
    const apply = () =>
      c.edits.edit({ key: "lesson.resetStep" }, (d) => {
        const draft = d as unknown as Record<string, unknown>;
        for (const k of Object.keys(draft)) if (!(k in snap)) delete draft[k];
        for (const [k, v] of Object.entries(snap)) draft[k] = v;
      });
    if (this.opts.runtime) this.opts.runtime.asTrusted(apply);
    else apply();
    c.reset();
    this.engine.restartStep();
  }

  // ------------------------------------------------------------ internals

  private bump(): void {
    this.view.set((s) => ({ version: s.version + 1 }));
  }

  private onEvent(ev: EngineEvent): void {
    if (ev.type === "change") return this.bump();
    if (ev.type === "enter") this.enterStep();
    if (ev.type === "complete" && this.engine.lesson.steps[ev.index].type === "observe") this.c.pause();
    if (ev.type === "complete") this.applyEffects(); // a prediction unlocks Run
    this.reportEvent(ev);
    void this.persist();
  }

  private reportEvent(ev: EngineEvent): void {
    if (this.opts.reporter) reportLessonEvent(this.opts.reporter, this.engine, ev);
    const e = this.engine;
    this.opts.post?.("lessonProgress", {
      lessonId: e.lesson.id,
      title: e.lesson.title,
      event: ev.type,
      step: e.index + 1,
      of: e.count,
      status: e.complete ? "complete" : "active",
      done: e.progress().steps.filter((r) => r.complete).length,
      completed: e.isFinished,
    });
  }

  private async persist(): Promise<void> {
    try {
      await this.opts.store?.save(this.opts.key, this.engine.progress());
    } catch {
      // Storage full or blocked: the lesson still works, it just will not resume.
    }
  }

  private enterStep(): void {
    this.snapshot = this.c.edits.doc;
    this.applyEffects();
    this.evaluate("enter");
  }

  /** §4.2 steps 2–3: capability set, run lock, blind mode, spotlights, fault overlay. */
  applyEffects(): void {
    const eff = this.engine.effects();
    const rt = this.opts.runtime;
    const caps = rt && this.baseCaps ? lessonCapabilities(this.baseCaps, eff.permissions, eff.blind) : undefined;
    if (rt && caps) rt.setCapabilities(caps);
    // The runtime's gate plus the lesson's own commands and the run lock (LES-03).
    this.c.commands.setGate((cmd) => {
      if (cmd.id.startsWith("lesson.")) return true;
      if (eff.runLocked && RUN_COMMANDS.has(cmd.id)) return false;
      return caps ? granted(caps, commandCapability(cmd)) : true;
    });
    if (eff.runLocked && this.c.store.get().runState === "running") this.c.pause();
    this.setBlindClasses(eff.blind);
    this.spot = splitSpotlight(eff.spotlight);
    this.applyFault(eff);
    this.syncOverlay();
    this.c.scheduler.invalidate("overlay");
    this.bump();
  }

  private applyFault(eff: StepEffects): void {
    const key = eff.fault ? JSON.stringify(eff.fault) : undefined;
    if (key === this.faultKey) return;
    this.faultKey = key;
    const f = eff.fault;
    const terms = (p: Part) => this.c.resolver.terminals(p);
    this.c.compileOverlay = f ? (d) => applyFault(d, f, terms) : undefined;
    // Recompile the whole circuit with (or without) the hidden fault.
    this.c.reset();
    this.c.sim?.load(this.c.edits.doc);
  }

  private setBlindClasses(blind: readonly string[]): void {
    // Canvas flags, hover cards, meters and the chart read this flag (blind prediction).
    const want = { readouts: blind.includes("readouts"), traces: blind.includes("traces") };
    const cur = this.c.store.get().blind;
    if (cur?.readouts !== want.readouts || cur?.traces !== want.traces) this.c.store.set({ blind: want });
    const el = this.opts.shell?.();
    if (!el) return;
    for (const b of ["readouts", "traces", "animation"]) el.classList.toggle(`lesson-blind-${b}`, blind.includes(b));
  }

  private syncOverlay(): void {
    const s = this.c.schematic;
    if (s === this.overlayOn) return;
    this.offOverlay?.();
    this.overlayOn = s;
    this.offOverlay = s?.addOverlay(spotlightDrawer(this.c, () => this.spot.parts));
  }

  private onFrame(): void {
    const t = this.now();
    // Observe steps stop the run as close to their time as frames allow.
    const observing = this.engine.current.type === "observe" && !this.engine.complete;
    if (observing || t - this.lastFrameEval >= FRAME_EVAL_MS) {
      this.lastFrameEval = t;
      this.evaluate("frame");
    } else if (!this.frameTimer) {
      this.frameTimer = setTimeout(() => {
        this.frameTimer = undefined;
        this.lastFrameEval = this.now();
        this.evaluate("frame");
      }, FRAME_EVAL_MS - (t - this.lastFrameEval));
    }
  }

  private evaluate(reason: Reason): void {
    if (this.engine.isFinished && this.engine.index === this.engine.count - 1 && this.engine.complete) return;
    this.engine.evaluate(lessonContext(this.c), reason);
  }
}
