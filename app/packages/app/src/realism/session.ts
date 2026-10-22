// The realism session (Section 16): turns the engine's partFailed events into
// document facts and messages, keeps the warning list for parts over their
// rating, forwards repairs to the worker, and runs the puff of smoke.

import type { Diagnostic, MessageRef, PatchBatch } from "@cs/model";
import type { Frame } from "@cs/worker";
import { failedMode, type RatingSpec } from "@cs/elements";
import type { AppController } from "../controller";
import { t } from "../messages";
import { failureMessage, idealHintMessage, overRatingMessage, type FailureFacts } from "./notes";
import { markFailed, repairedByPatches } from "./repair";

type Diag = Omit<Diagnostic, "fixes">;

/** An overstress in progress: when it started and its peak, for the failure message. */
interface Overstress {
  since: number;
  peak: number;
  spec: RatingSpec;
  rating: number;
}

export interface Smoke {
  part: string;
  /** Real time it started, seconds. */
  start: number;
}

export const SMOKE_SECONDS = 1.4;
/** Warnings refresh at most this often (they drive React renders). */
const WARN_MS = 500;
/** RLM-08: an info hint in ideal mode beyond this multiple of a typical rating. */
const HINT_FACTOR = 10;

export class RealismSession {
  /** Failure messages by part id, from the event that failed it. */
  readonly notes = new Map<string, MessageRef>();
  readonly smokes: Smoke[] = [];
  /** Power view (ANI-16), session state. */
  powerView = false;
  /** RLM-08 hints in ideal mode; a learner may turn them off. */
  idealHints = true;
  private over = new Map<string, Overstress>();
  private pending: { id: string; mode: "open" | "short" }[] = [];
  private warnings: Diag[] = [];
  private lastWarn = 0;

  constructor(
    private c: AppController,
    private announce: (text: string) => void = () => {},
    private now: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000,
  ) {}

  /** Diagnostics for the status bar and warning list. */
  diagnostics(): Diag[] {
    const doc = this.c.edits.doc;
    const out: Diag[] = [];
    for (const p of Object.values(doc.parts)) {
      if (!failedMode(p.props)) continue;
      out.push({
        id: "part-failed",
        severity: "error",
        message: this.notes.get(p.id) ?? { key: "realism.failed", values: { label: p.label || p.type } },
        elements: [p.id],
      });
    }
    return [...out, ...this.warnings];
  }

  onFrame(f: Frame): void {
    const live = this.c.schematic?.live;
    const doc = this.c.edits.doc;
    // Track overstress, for "flowed through it for 0.4 s".
    if (live) {
      for (const [id, v] of live.parts()) {
        if (!v.worst || v.stress <= 1 || v.failed) {
          if (!v.failed) this.over.delete(id);
          continue;
        }
        const o = this.over.get(id);
        if (!o) this.over.set(id, { since: f.t0, peak: v.worst.value, spec: v.worst.spec, rating: v.worst.rating });
        else if (v.worst.value > o.peak) {
          o.peak = v.worst.value;
          o.spec = v.worst.spec;
          o.rating = v.worst.rating;
        }
      }
    }
    for (const ev of f.events) {
      if (ev.kind !== "partFailed" || !ev.element) continue;
      const part = doc.parts[ev.element];
      if (!part) continue;
      const mode = ev.detail === "short" ? "short" : "open";
      const o = this.over.get(ev.element);
      const facts: FailureFacts = {
        label: part.label || part.type,
        type: part.type,
        props: part.props,
        spec: o?.spec,
        value: o?.peak,
        rating: o?.rating,
        duration: o ? ev.t - o.since : undefined,
        supply: live?.maxVoltage,
      };
      const msg = failureMessage(facts, t);
      this.notes.set(ev.element, msg);
      this.announce(t(msg));
      this.smokes.push({ part: ev.element, start: this.now() });
      this.pending.push({ id: ev.element, mode });
    }
    this.flushPending();
    const nowMs = this.now() * 1000;
    if (nowMs - this.lastWarn >= WARN_MS) {
      this.lastWarn = nowMs;
      this.refreshWarnings();
    }
  }

  /** Write failures into the document; retried when a gesture holds the edit system. */
  flushPending(): void {
    if (!this.pending.length) return;
    const list = this.pending;
    this.pending = [];
    for (const { id, mode } of list) {
      const part = this.c.edits.doc.parts[id];
      if (!part) continue;
      try {
        this.c.edits.edit({ key: "realism.failEdit", values: { label: part.label || part.type } }, (d) => void markFailed(d, id, mode));
      } catch {
        this.pending.push({ id, mode }); // a drag is in progress; try on the next frame
      }
    }
    this.c.refreshDiagnostics?.();
  }

  /** Forward repairs (Repair, Undo of a failure) the parameter path cannot express. */
  onPatches(b: PatchBatch): void {
    // Edits carry their patches in the provisional batch; undo and redo in a final one.
    const ids = repairedByPatches(b.patches);
    if (!ids.length) return;
    for (const id of ids) {
      this.notes.delete(id);
      this.over.delete(id);
    }
    this.c.sim?.send({ type: "setParams", changes: ids.map((element) => ({ element, param: "failed", value: "" })) });
    this.c.refreshDiagnostics?.();
  }

  private refreshWarnings(): void {
    const live = this.c.schematic?.live;
    const doc = this.c.edits.doc;
    const next: Diag[] = [];
    if (live) {
      for (const [id, v] of live.parts()) {
        const p = doc.parts[id];
        if (!p || !v.worst || v.failed) continue;
        const label = p.label || p.type;
        if (live.ratingsOn && v.stress > 1) {
          next.push({ id: "over-rating", severity: "warning", message: overRatingMessage(label, v.worst.spec, v.worst.value, v.worst.rating), elements: [id] });
        } else if (!live.ratingsOn && this.idealHints && v.worst.value > HINT_FACTOR * v.worst.rating) {
          next.push({ id: "beyond-rating", severity: "info", message: idealHintMessage(label, v.worst.spec, v.worst.value), elements: [id] });
        }
      }
    }
    const key = (l: Diag[]) => l.map((d) => `${d.id}:${d.elements.join()}:${JSON.stringify(d.message.values)}`).join("|");
    if (key(next) === key(this.warnings)) return;
    this.warnings = next;
    this.c.refreshDiagnostics?.();
  }

  /** Smokes still in the air at real time `now` (older ones are dropped). */
  activeSmokes(now = this.now()): Smoke[] {
    while (this.smokes.length && now - this.smokes[0].start > SMOKE_SECONDS) this.smokes.shift();
    return this.smokes;
  }
}
