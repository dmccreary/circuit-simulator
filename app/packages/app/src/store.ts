import { useCallback, useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(fn: () => void): () => void;
}

/** A minimal external store; React reads it with useStore and a selector. */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === "function" ? patch(state) : patch;
      let changed = false;
      for (const k of Object.keys(p) as (keyof T)[]) if (!Object.is(state[k], p[k])) changed = true;
      if (!changed) return;
      state = { ...state, ...p };
      for (const s of [...subs]) s();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

/** Re-renders only when the selected slice changes identity. */
export function useStore<T, S>(store: { get(): T; subscribe(fn: () => void): () => void }, select: (s: T) => S): S {
  const get = useCallback(() => select(store.get()), [store, select]);
  return useSyncExternalStore(store.subscribe, get, get);
}
