import { STORE_NAMES, type StorageBackend, type StoreKey, type StoreName } from "./backend";

const compareKeys = (a: StoreKey, b: StoreKey): number =>
  typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === "number" ? -1 : 1;

/**
 * In-memory backend with IndexedDB's copy semantics (values are cloned on the
 * way in and out). Used by tests and when IndexedDB is unavailable, such as in
 * some private-browsing modes.
 */
export function createMemoryBackend(): StorageBackend {
  const stores = new Map<StoreName, Map<StoreKey, unknown>>(STORE_NAMES.map((n) => [n, new Map()]));
  const store = (n: StoreName) => {
    const s = stores.get(n);
    if (!s) throw new Error(`Unknown store ${n}`);
    return s;
  };
  return {
    async get<T>(n: StoreName, key: StoreKey) {
      const v = store(n).get(key);
      return v === undefined ? undefined : (structuredClone(v) as T);
    },
    async put<T>(n: StoreName, key: StoreKey, value: T) {
      store(n).set(key, structuredClone(value));
    },
    async delete(n: StoreName, key: StoreKey) {
      store(n).delete(key);
    },
    async entries<T>(n: StoreName) {
      return [...store(n)]
        .sort(([a], [b]) => compareKeys(a, b))
        .map(([k, v]) => [k, structuredClone(v) as T] as [StoreKey, T]);
    },
    close() {},
  };
}
