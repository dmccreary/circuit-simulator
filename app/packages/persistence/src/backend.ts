// The browser-storage stores (files-and-persistence.md §5.2). Everything the
// app keeps in IndexedDB goes through this small interface, so the Node test
// suite can run against the in-memory implementation.

export const STORE_NAMES = ["circuits", "recovery", "embeds", "subcircuits", "lessons", "xapiQueue"] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export type StoreKey = string | number;

export interface StorageBackend {
  get<T>(store: StoreName, key: StoreKey): Promise<T | undefined>;
  put<T>(store: StoreName, key: StoreKey, value: T): Promise<void>;
  delete(store: StoreName, key: StoreKey): Promise<void>;
  /** Every record in the store, in key order. */
  entries<T>(store: StoreName): Promise<Array<[StoreKey, T]>>;
  close(): void;
}
