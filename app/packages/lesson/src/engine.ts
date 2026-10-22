// The step machine (embedding-lessons-xapi.md §4.2). Pure: the app feeds it a
// lesson context when a patch or frame arrives and applies its effects.

import { amount, compare, toleranceWidth } from "./amount";
import { checkDeps, evaluateCheck, readValue } from "./checks";
import { findPart, type LessonContext, type Reason } from "./context";
import { pickFault } from "./faults";
import { emptyRecord, restoreProgress, type Answer, type LessonProgress, type StepRecord } from "./progress";
import { findStep } from "./validate";
import type { BlindItem, Fault, Lesson, Permissions, Step } from "./types";

export type EngineEvent =
  | { type: "enter"; index: number }
  | { type: "complete"; index: number }
  | { type: "hint"; index: number; hint: number }
  | { type: "answer"; index: number; answer: Answer; correct?: boolean }
  | { type: "finished" }
  | { type: "change" };

/** What the shell must apply while a step is active (§4.2 steps 2 and 3). */
export interface StepEffects {
  permissions: Permissions;
  blind: BlindItem[];
  /** Run and Step are refused until the prediction is in (LES-03). */
  runLocked: boolean;
  spotlight: string[];
  /** A hidden fault overlay for the compiler (LES-07). */
  fault?: Fault;
}

export interface PredictionSummary {
  step: number;
  prompt: string;
  predicted: string;
  actual?: string;
  correct?: boolean;
}

export interface LessonSummary {
  done: number;
  count: number;
  hints: number;
  predictions: PredictionSummary[];
}

export interface EngineOptions {
  learnerId: string;
  progress?: unknown;
  now?: () => number;
}

export interface SubmitResult {
  ok: boolean;
  message?: string;
}

export class LessonEngine {
  private records: StepRecord[];
  private idx = 0;
  /** The completion summary is showing. */
  private finished = false;
  /** The lesson has been completed at least once (saved in progress). */
  private completedOnce = false;
  private startedAt: number;
  private listeners = new Set<(e: EngineEvent) => void>();
  /** Last answer of each feedback condition of the current step (LES-11). */
  private fbState: boolean[] = [];
  /** Observe steps: simulated time when the step began (lowered if the learner resets). */
  private observeBase: number | undefined;
  /** Message after the current step completed, or after a wrong answer. */
  message: { text: string; tone: "success" | "info" | "error" } | undefined;
  private now: () => number;

  constructor(
    readonly lesson: Lesson,
    private opts: EngineOptions,
  ) {
    this.now = opts.now ?? (() => Date.now());
    const saved = restoreProgress(opts.progress, lesson.id, lesson.steps.length);
    this.records = saved ? saved.steps.map((r) => ({ ...emptyRecord(), ...r })) : lesson.steps.map(emptyRecord);
    this.idx = saved?.index ?? 0;
    this.finished = saved?.completed ?? false;
    this.completedOnce = this.finished;
    this.startedAt = saved?.startedAt ?? this.now();
    this.markReadComplete();
  }

  on(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent): void {
    for (const l of [...this.listeners]) l(e);
    if (e.type !== "change") for (const l of [...this.listeners]) l({ type: "change" });
  }

  get index(): number {
    return this.idx;
  }
  get count(): number {
    return this.lesson.steps.length;
  }
  get current(): Step {
    return this.lesson.steps[this.idx];
  }
  get complete(): boolean {
    return this.records[this.idx].complete;
  }
  get isFinished(): boolean {
    return this.finished;
  }
  record(i = this.idx): StepRecord {
    return this.records[i];
  }
  get step(): { index: number; count: number; status: "active" | "complete" } {
    return { index: this.idx, count: this.count, status: this.complete ? "complete" : "active" };
  }

  get canBack(): boolean {
    return this.idx > 0 || this.finished;
  }
  /** Next enables when the step is complete (LES-12); on the last step it finishes the lesson. */
  get canNext(): boolean {
    return this.complete && !this.finished;
  }

  next(): boolean {
    if (!this.canNext) return false;
    if (this.idx === this.count - 1) {
      this.finished = true;
      this.completedOnce = true;
      this.message = undefined;
      this.emit({ type: "finished" });
      return true;
    }
    this.goTo(this.idx + 1);
    return true;
  }

  back(): boolean {
    if (!this.canBack) return false;
    if (this.finished) {
      // From the summary back to the last step, to review it.
      this.finished = false;
      this.goTo(this.idx);
      return true;
    }
    this.goTo(this.idx - 1);
    return true;
  }

  goTo(i: number): void {
    if (i < 0 || i >= this.count) return;
    this.idx = i;
    this.message = undefined;
    this.fbState = this.current.feedback.map(() => false);
    this.observeBase = undefined;
    this.markReadComplete();
    this.emit({ type: "enter", index: i });
  }

  /** Start the current step over (Reset Step): its record is cleared except hints used. */
  restartStep(): void {
    const r = this.records[this.idx];
    this.records[this.idx] = { ...emptyRecord(), hints: r.hints, attempts: r.attempts, wrong: r.wrong };
    this.message = undefined;
    this.observeBase = undefined;
    this.markReadComplete();
    this.emit({ type: "enter", index: this.idx });
  }

  private markReadComplete(): void {
    if (this.current.type === "read") this.records[this.idx].complete = true;
  }

  // ------------------------------------------------------------ hints and feedback

  hintsShown(): string[] {
    return this.current.hints.slice(0, this.records[this.idx].hints);
  }

  get hasMoreHints(): boolean {
    return this.records[this.idx].hints < this.current.hints.length;
  }

  /** LES-10: reveal the next hint; its use is recorded. */
  revealHint(): string | undefined {
    const r = this.records[this.idx];
    if (r.hints >= this.current.hints.length) return undefined;
    r.hints++;
    this.emit({ type: "hint", index: this.idx, hint: r.hints });
    return this.current.hints[r.hints - 1];
  }

  /** The feedback to show for the current state, if any (LES-11). */
  get feedback(): string | undefined {
    if (this.complete) return undefined;
    const i = this.fbState.findIndex(Boolean);
    return i >= 0 ? this.current.feedback[i].say : undefined;
  }

  // ------------------------------------------------------------ effects

  effects(): StepEffects {
    const s = this.current;
    const r = this.records[this.idx];
    const predicting = (s.type === "predict-number" || s.type === "predict-choice") && !r.complete;
    return {
      permissions: { ...this.lesson.permissions, ...(s.permissions ?? {}) },
      blind: predicting ? s.blind : [],
      runLocked: predicting && s.lockRun,
      spotlight: s.spotlight,
      fault: this.activeFault(),
    };
  }

  /** The fault this learner gets on a Troubleshoot step, applied while that step is current. */
  activeFault(): Fault | undefined {
    const s = this.current;
    if (s.type !== "troubleshoot" || s.faults.length === 0) return undefined;
    return s.faults[pickFault(s.faults, this.opts.learnerId, this.lesson.id, this.idx)];
  }

  // ------------------------------------------------------------ evaluation

  /**
   * Re-evaluate the current step's checks and feedback after `reason`
   * (a patch, a frame, new diagnostics, or entering the step). Checks that
   * do not depend on the reason keep their last answer (LES-08). Returns true
   * when anything visible changed.
   */
  evaluate(ctx: LessonContext, reason: Reason): boolean {
    const s = this.current;
    const r = this.records[this.idx];
    let changed = false;

    const fb = s.feedback.map((f, i) => {
      if ("diagnostic" in f) return reason === "frame" ? this.fbState[i] : ctx.diagnostics.some((d) => d.id === f.diagnostic);
      return reason === "enter" || checkDeps(f.when).has(reason) ? evaluateCheck(f.when, ctx) : this.fbState[i];
    });
    if (fb.some((b, i) => b !== this.fbState[i])) changed = true;
    this.fbState = fb;

    if (r.complete) return changed;
    if (s.type === "do" && (reason === "enter" || checkDeps(s.check).has(reason)) && evaluateCheck(s.check, ctx)) {
      this.completeStep(s.success ?? "Done — that's it.");
      return true;
    }
    if (s.type === "observe" && (reason === "frame" || reason === "enter")) {
      if (s.show) {
        const v = readValue(ctx, s.show);
        if (v !== undefined && v !== r.observed) {
          r.observed = v;
          changed = true;
        }
      }
      // "run-for" counts from the step's start, or from t = 0 after a reset.
      if (this.observeBase === undefined || ctx.simTime < this.observeBase) this.observeBase = ctx.simTime;
      if (ctx.simTime - this.observeBase >= s.runFor - 1e-9) {
        this.completeStep(s.success ?? "Observed.");
        return true;
      }
    }
    if (changed) this.emit({ type: "change" });
    return changed;
  }

  private completeStep(text: string): void {
    this.records[this.idx].complete = true;
    this.message = { text, tone: "success" };
    this.emit({ type: "complete", index: this.idx });
  }

  // ------------------------------------------------------------ answers

  /** Predictions, measurements, explanations and troubleshooting clicks. */
  submit(answer: Answer, ctx?: LessonContext): SubmitResult {
    const s = this.current;
    const r = this.records[this.idx];
    const reject = (text: string): SubmitResult => {
      r.attempts++;
      this.message = { text, tone: "error" };
      this.emit({ type: "answer", index: this.idx, answer, correct: false });
      return { ok: false, message: text };
    };
    const accept = (correct?: boolean, text = s.success ?? "Saved."): SubmitResult => {
      r.answer = answer;
      if (correct !== undefined) r.correct = correct;
      this.emit({ type: "answer", index: this.idx, answer, correct });
      if (!r.complete) this.completeStep(text);
      return { ok: true, message: text };
    };

    switch (s.type) {
      case "predict-number":
        if (!("number" in answer) || !Number.isFinite(answer.number)) return { ok: false, message: "Type a number, such as 2.5 V." };
        return accept(undefined, s.success ?? "Prediction saved. Now let's find out.");
      case "predict-choice":
        if (!("choice" in answer) || !(answer.choice >= 0 && answer.choice < s.options.length)) return { ok: false, message: "Pick an option." };
        return accept(s.answer === undefined ? undefined : answer.choice === s.answer, s.success ?? "Prediction saved. Now let's find out.");
      case "explain":
        if ("text" in answer && !("number" in answer) && answer.text.trim()) return accept(undefined, s.success ?? "Thanks — saved.");
        if ("choice" in answer && s.options && answer.choice >= 0 && answer.choice < s.options.length) return accept(undefined, s.success ?? "Thanks — saved.");
        return { ok: false, message: s.options ? "Pick a reason." : "Write a sentence first." };
      case "measure": {
        if (!("number" in answer) || !Number.isFinite(answer.number)) return { ok: false, message: "Type the reading, such as 1.2 mA." };
        const truth = ctx ? readValue(ctx, s.value) : undefined;
        if (truth === undefined) return reject("There is no reading yet. Run the simulation first.");
        const w = toleranceWidth(s.tolerance, truth) ?? 0;
        if (compare(Math.abs(answer.number), { equals: Math.abs(truth), tolerance: w })) return accept(true, s.success ?? "Correct — that matches the meter.");
        return reject(`Not quite. That is not within ${typeof s.tolerance === "string" ? s.tolerance : amount(s.tolerance)} of the meter's reading. Check the units and try again.`);
      }
      case "troubleshoot": {
        if (!("part" in answer)) return { ok: false, message: "Select a part first." };
        const fault = this.activeFault();
        const clicked = ctx ? findPart(ctx.doc, answer.part) : undefined;
        const target = ctx && fault ? findPart(ctx.doc, fault.part) : undefined;
        const right = fault ? (clicked && target ? clicked.id === target.id : answer.part === fault.part) : false;
        if (right) return accept(true, s.success ?? `Found it: ${fault!.part} is faulty.`);
        r.wrong.push(answer.part);
        return reject(`${answer.part} is working correctly. Keep looking.`);
      }
      default:
        return { ok: false };
    }
  }

  // ------------------------------------------------------------ progress and summary

  progress(): LessonProgress {
    return {
      version: 1,
      lessonId: this.lesson.id,
      stepCount: this.count,
      index: this.idx,
      steps: this.records.map((r) => ({ ...r, wrong: [...r.wrong] })),
      completed: this.completedOnce,
      startedAt: this.startedAt,
      updatedAt: this.now(),
    };
  }

  /** LES-14: steps done, predictions next to results, hints used. */
  summary(): LessonSummary {
    const steps = this.lesson.steps;
    const predictions: PredictionSummary[] = [];
    steps.forEach((s, i) => {
      if (s.type !== "predict-number" && s.type !== "predict-choice") return;
      const r = this.records[i];
      if (!r.answer) return;
      const predicted = "number" in r.answer ? (r.answer.text ?? String(r.answer.number)) : "choice" in r.answer && s.type === "predict-choice" ? s.options[r.answer.choice] : "";
      const obs = steps.findIndex((o, j) => o.type === "observe" && o.compareWith !== undefined && findStep(steps, o.compareWith) === i && j > i);
      let actual: string | undefined;
      if (s.type === "predict-choice" && s.answer !== undefined) actual = s.options[s.answer];
      else if (obs >= 0 && this.records[obs].observed !== undefined) {
        const o = steps[obs];
        const unit = s.type === "predict-number" ? s.unit : undefined;
        actual = formatNumber(this.records[obs].observed!, o.type === "observe" ? (o.unit ?? unit) : unit);
      }
      predictions.push({ step: i + 1, prompt: s.text, predicted, actual, correct: r.correct });
    });
    return {
      done: this.records.filter((r) => r.complete).length,
      count: this.count,
      hints: this.records.reduce((n, r) => n + r.hints, 0),
      predictions,
    };
  }

  /** The prediction an Observe step compares with, and the value it shows (LES-04). */
  comparison(i = this.idx): { predicted: string; observed?: number; unit?: string } | undefined {
    const s = this.lesson.steps[i];
    if (s.type !== "observe" || s.compareWith === undefined) return undefined;
    const p = findStep(this.lesson.steps, s.compareWith);
    const ps = this.lesson.steps[p];
    const a = this.records[p]?.answer;
    if (!ps || !a) return undefined;
    const predicted = "number" in a ? (a.text ?? String(a.number)) : "choice" in a && ps.type === "predict-choice" ? ps.options[a.choice] : "—";
    return { predicted, observed: this.records[i].observed, unit: s.unit ?? (ps.type === "predict-number" ? ps.unit : undefined) };
  }
}

/** Three significant figures plus a unit symbol, without the units package's prefixes. */
export function formatNumber(v: number, unit?: string): string {
  const a = Math.abs(v);
  const prefixes: [number, string][] = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]];
  const [scale, prefix] = a === 0 ? [1, ""] : (prefixes.find(([s]) => a >= s * 0.9995) ?? [1e-12, "p"]);
  const n = Number((v / scale).toPrecision(3));
  return unit ? `${n} ${prefix}${unit}` : `${n}${prefix ? " " + prefix : ""}`;
}
