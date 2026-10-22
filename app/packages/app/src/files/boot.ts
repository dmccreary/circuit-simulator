// Startup for the file layer: open browser storage, start autosave, open the
// circuit the page address names, then offer back unsaved work (FIL-09).

import { holdSessionLock, newSessionId, openBrowserPersistence } from "@cs/persistence";
import { startAutosave, type AutosaveHandle } from "./autosave";
import type { FileSession } from "./session";

const booted = new WeakMap<FileSession, Promise<AutosaveHandle | undefined>>();

/** Runs once per session, however many times React mounts the host. */
export function bootFiles(session: FileSession, href: string): Promise<AutosaveHandle | undefined> {
  let p = booted.get(session);
  if (!p) {
    p = boot(session, href);
    booted.set(session, p);
  }
  return p;
}

export function autosaveOf(session: FileSession): Promise<AutosaveHandle | undefined> | undefined {
  return booted.get(session);
}

/** Embedded in a chapter page: no autosave and no recovery prompt, which belong to the full simulator. */
const isFramed = (): boolean => typeof window !== "undefined" && window.parent !== window;

async function boot(session: FileSession, href: string): Promise<AutosaveHandle | undefined> {
  if (isFramed()) {
    await session.openFromUrl(href);
    return undefined;
  }
  let auto: AutosaveHandle | undefined;
  try {
    const sessionId = newSessionId();
    holdSessionLock(sessionId);
    const { persistence } = await openBrowserPersistence();
    auto = startAutosave(session, { persistence, sessionId });
  } catch {
    auto = undefined; // storage unavailable: files and links still work
  }
  await session.openFromUrl(href);
  if (auto) {
    const entries = await auto.recoveries().catch(() => []);
    if (entries.length && !session.ui.get().dialog) session.ui.set({ dialog: { kind: "recovery", entries } });
  }
  return auto;
}
