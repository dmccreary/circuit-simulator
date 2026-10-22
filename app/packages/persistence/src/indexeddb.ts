import { STORE_NAMES, type StorageBackend, type StoreKey, type StoreName } from "./backend";

export const DB_NAME = "circuit-simulator";
/** Bump when a store is added; `upgradeneeded` creates any missing store. */
export const DB_VERSION = 1;

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Thin promise wrapper over IndexedDB with out-of-line keys. */
export async function openIndexedDb(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<StorageBackend> {
  const open = factory.open(name, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    for (const s of STORE_NAMES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
  };
  const db = await req(open);

  const tx = (n: StoreName, mode: IDBTransactionMode) => db.transaction(n, mode).objectStore(n);
  const done = (t: IDBTransaction): Promise<void> =>
    new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = t.onabort = () => reject(t.error);
    });

  return {
    get: <T>(n: StoreName, key: StoreKey) => req(tx(n, "readonly").get(key)) as Promise<T | undefined>,
    async put<T>(n: StoreName, key: StoreKey, value: T) {
      const s = tx(n, "readwrite");
      s.put(value, key);
      await done(s.transaction);
    },
    async delete(n: StoreName, key: StoreKey) {
      const s = tx(n, "readwrite");
      s.delete(key);
      await done(s.transaction);
    },
    async entries<T>(n: StoreName) {
      const s = tx(n, "readonly");
      const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
      return keys.map((k, i) => [k as StoreKey, values[i] as T] as [StoreKey, T]);
    },
    close: () => db.close(),
  };
}
