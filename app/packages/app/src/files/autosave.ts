// Autosave and recovery wiring (files-and-persistence.md §5.3, PRF-06, FIL-09).
// While the document has unsaved changes, it is written to this tab's
// `recovery` entry one second after each committed change and at once when
// the page is hidden. Once saved (or replaced by a clean document) the entry
// is removed, so only unsaved work is ever offered back.

import { parseCircuit, serializeCircuitCompact } from "@cs/formats";
import {
  createAutosaver,
  liveSessions as defaultLiveSessions,
  pickRecoveries,
  type Autosaver,
  type Persistence,
  type RecoveryRecord,
  type Timers,
} from "@cs/persistence";
import { t } from "../messages";
import type { FileSession } from "./session";

export interface AutosaveOptions {
  persistence: Persistence;
  sessionId: string;
  timers?: Timers;
  delayMs?: number;
  liveSessions?: () => Promise<Set<string>>;
  now?: () => number;
}

export interface AutosaveHandle {
  autosaver: Autosaver;
  /** Entries left by tabs that are gone, newest first. */
  recoveries(): Promise<RecoveryRecord[]>;
  restore(entry: RecoveryRecord): Promise<boolean>;
  discard(entries: RecoveryRecord[]): Promise<void>;
  dispose(): void;
}

export function startAutosave(session: FileSession, opts: AutosaveOptions): AutosaveHandle {
  const { persistence, sessionId } = opts;
  const now = opts.now ?? Date.now;
  const record = (): RecoveryRecord => ({
    sessionId,
    text: serializeCircuitCompact(session.c.edits.doc),
    title: session.c.edits.doc.meta.title,
    fileName: session.fileName,
    changedAt: now(),
  });
  const autosaver = createAutosaver({
    write: () => persistence.recovery.put(sessionId, record()),
    timers: opts.timers,
    delayMs: opts.delayMs,
    onError: () => session.notify(t("files.autosaveFailed"), true),
  });

  const offChange = session.onChange(() => {
    if (session.dirty) autosaver.schedule();
    else {
      autosaver.cancel();
      void persistence.recovery.delete(sessionId).catch(() => {});
    }
  });

  const hidden = () => {
    if (typeof document === "undefined" || document.visibilityState === "hidden") void autosaver.flush();
  };
  const hasDom = typeof window !== "undefined" && typeof document !== "undefined";
  if (hasDom) {
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", hidden);
  }

  return {
    autosaver,
    async recoveries() {
      const [entries, live] = await Promise.all([persistence.recovery.values(), (opts.liveSessions ?? defaultLiveSessions)()]);
      return pickRecoveries(entries, sessionId, live);
    },
    async restore(entry) {
      let ok = false;
      try {
        const { doc, notices } = parseCircuit(entry.text);
        ok = await session.openDocument(doc, { notices, dirty: true, fileName: entry.fileName });
      } catch (e) {
        session.notify(t({ key: "files.openFailed", values: { name: entry.title, reason: (e as Error).message } }), true);
      }
      if (ok) await persistence.recovery.delete(entry.sessionId);
      return ok;
    },
    async discard(entries) {
      await Promise.all(entries.map((e) => persistence.recovery.delete(e.sessionId)));
    },
    dispose() {
      offChange();
      autosaver.cancel();
      if (hasDom) {
        document.removeEventListener("visibilitychange", hidden);
        window.removeEventListener("pagehide", hidden);
      }
    },
  };
}
