import { createMemoryBackend } from "./memory";
import { openIndexedDb } from "./indexeddb";
import { createPersistence, type Persistence } from "./stores";

/** IndexedDB when the browser allows it, otherwise memory (work then lasts only for this page). */
export async function openBrowserPersistence(): Promise<{ persistence: Persistence; durable: boolean }> {
  if (typeof indexedDB !== "undefined") {
    try {
      return { persistence: createPersistence(await openIndexedDb(indexedDB)), durable: true };
    } catch {
      // Blocked (private mode, storage disabled): fall through.
    }
  }
  return { persistence: createPersistence(createMemoryBackend()), durable: false };
}
