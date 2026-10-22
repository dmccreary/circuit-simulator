// Recovery on startup (FIL-09): entries left by tabs that are no longer open
// are offered back, newest first. A tab marks itself alive by holding a Web
// Lock named after its session id for as long as it is open, so a second tab
// never offers (or deletes) the entry of a tab that is still running.

import type { RecoveryRecord } from "./stores";

export const SESSION_LOCK_PREFIX = "circuit-simulator-session:";

/** Entries worth offering: not ours, not held by a live tab, newest first. */
export function pickRecoveries(entries: RecoveryRecord[], ownSession: string, live: ReadonlySet<string>): RecoveryRecord[] {
  return entries
    .filter((e) => e.sessionId !== ownSession && !live.has(e.sessionId) && typeof e.text === "string" && e.text.length > 0)
    .sort((a, b) => b.changedAt - a.changedAt);
}

export function newSessionId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

type LockManagerLike = {
  request(name: string, cb: () => Promise<void>): Promise<void>;
  query(): Promise<{ held?: Array<{ name?: string }> }>;
};

const locks = (): LockManagerLike | undefined =>
  (globalThis.navigator as unknown as { locks?: LockManagerLike } | undefined)?.locks;

/** Hold this tab's session lock until the page goes away. */
export function holdSessionLock(sessionId: string): void {
  void locks()?.request(SESSION_LOCK_PREFIX + sessionId, () => new Promise<void>(() => {}));
}

/** Session ids of tabs that are open now. Without Web Locks, assume none. */
export async function liveSessions(): Promise<Set<string>> {
  const l = locks();
  if (!l) return new Set();
  try {
    const q = await l.query();
    return new Set(
      (q.held ?? [])
        .map((h) => h.name ?? "")
        .filter((n) => n.startsWith(SESSION_LOCK_PREFIX))
        .map((n) => n.slice(SESSION_LOCK_PREFIX.length)),
    );
  } catch {
    return new Set();
  }
}
