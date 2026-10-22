import type { PatchBatch } from "@cs/model";
import { createStore, type Store } from "../store";
import { t } from "../messages";
import type { AppController } from "../controller";

export interface Announcement {
  text: string;
  /** Increments per announcement so a repeat of the same text is still read. */
  seq: number;
}

/**
 * One polite live region (ACC-08). Each kind of event speaks at most once
 * every `gapMs`; a newer message inside the gap replaces the waiting one and
 * is spoken when the gap ends, so the last state is never lost.
 */
export class Announcer {
  readonly store: Store<Announcement> = createStore<Announcement>({ text: "", seq: 0 });
  private last = new Map<string, number>();
  private pending = new Map<string, { text: string; timer: ReturnType<typeof setTimeout> }>();

  constructor(
    private gapMs = 2000,
    private now: () => number = () => Date.now(),
  ) {}

  say(kind: string, text: string): void {
    const at = this.now();
    const prev = this.last.get(kind);
    const wait = prev === undefined ? 0 : prev + this.gapMs - at;
    if (wait <= 0) {
      const p = this.pending.get(kind);
      if (p) clearTimeout(p.timer);
      this.pending.delete(kind);
      this.emit(kind, text, at);
      return;
    }
    const p = this.pending.get(kind);
    if (p) {
      p.text = text;
      return;
    }
    const timer = setTimeout(() => {
      const q = this.pending.get(kind);
      this.pending.delete(kind);
      if (q) this.emit(kind, q.text, this.now());
    }, wait);
    this.pending.set(kind, { text, timer });
  }

  dispose(): void {
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
  }

  private emit(kind: string, text: string, at: number): void {
    this.last.set(kind, at);
    this.store.set((s) => ({ text, seq: s.seq + 1 }));
  }
}

const SWITCH_PROPS: Record<string, [string, string]> = {
  closed: ["a11y.closed", "a11y.open"],
  pressed: ["a11y.on", "a11y.off"],
};

/** Announce run-state changes, switch flips and diagnostics. Returns an unsubscribe. */
export function announceEvents(c: AppController, a: Announcer): () => void {
  let run = c.store.get().runState;
  let diag = c.store.get().diagnostics;
  const offStore = c.store.subscribe(() => {
    const st = c.store.get();
    if (st.runState !== run) {
      run = st.runState;
      a.say("run", t(`a11y.${run}`));
    }
    if (st.diagnostics !== diag) {
      const before = diag;
      diag = st.diagnostics;
      const key = (l: typeof diag) => l.map((d) => `${d.id}:${d.elements.join(",")}`).join("|");
      if (key(before) === key(diag)) return;
      a.say(
        "diagnostics",
        diag.length ? t({ key: "a11y.diagnostics", values: { count: diag.length, first: t(diag[0].message) } }) : t("a11y.noDiagnostics"),
      );
    }
  });
  const offEdits = c.edits.onPatches((b: PatchBatch) => {
    // The flip itself arrives in the provisional batch; the commit carries only normalization.
    if (b.source !== "edit" || b.label?.key !== "edit.toggle") return;
    for (const p of b.patches) {
      if (p.op !== "set" || p.path[0] !== "parts" || p.path[2] !== "props" || typeof p.value !== "boolean") continue;
      const part = c.edits.doc.parts[String(p.path[1])];
      if (!part) continue;
      const [on, off] = SWITCH_PROPS[String(p.path[3])] ?? ["a11y.on", "a11y.off"];
      a.say("switch", t({ key: "a11y.switched", values: { label: part.label || part.type, state: t(p.value ? on : off) } }));
    }
  });
  return () => {
    offStore();
    offEdits();
  };
}

