// Browser storage for My circuits and My parts. Opened once per controller on
// first use (the autosave layer opens its own connection to the same database).
// Tests hand in a persistence over the in-memory backend instead.

import { openBrowserPersistence, type Persistence } from "@cs/persistence";
import type { AppController } from "../controller";

const opened = new WeakMap<AppController, Promise<{ persistence: Persistence; durable: boolean }>>();

export function storageOf(c: AppController): Promise<{ persistence: Persistence; durable: boolean }> {
  let p = opened.get(c);
  if (!p) {
    p = openBrowserPersistence();
    opened.set(c, p);
  }
  return p;
}

export function useStorage(c: AppController, persistence: Persistence, durable = true): void {
  opened.set(c, Promise.resolve({ persistence, durable }));
}

/**
 * Ask the browser not to evict our storage under pressure (FIL-08). Resolves
 * true when storage is persistent; harmless where the API is missing.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const s = (globalThis.navigator as { storage?: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> } } | undefined)?.storage;
  try {
    if (await s?.persisted?.()) return true;
    return (await s?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
