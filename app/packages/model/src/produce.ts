// A minimal copy-on-write draft (immer-like) for plain objects and arrays.
import { diff, isDraftable } from "./patches";
import type { Patch } from "./types";

type Obj = Record<string | symbol, unknown>;

interface DraftState {
  base: Obj;
  copy: Obj | null;
  modified: boolean;
  parent: DraftState | null;
  isArray: boolean;
  proxy: Obj;
  revoke: () => void;
}

const states = new WeakMap<object, DraftState>();

const latest = (s: DraftState): Obj => s.copy ?? s.base;

function prepareCopy(s: DraftState): Obj {
  if (!s.copy) s.copy = (s.isArray ? (s.base as unknown as unknown[]).slice() : { ...s.base }) as Obj;
  return s.copy;
}

function markChanged(s: DraftState | null): void {
  while (s && !s.modified) {
    s.modified = true;
    prepareCopy(s);
    s = s.parent;
  }
}

function createDraft(base: Obj, parent: DraftState | null, all: DraftState[]): Obj {
  const isArray = Array.isArray(base);
  const state = { base, copy: null, modified: false, parent, isArray } as unknown as DraftState;
  const handler: ProxyHandler<Obj> = {
    get(_t, prop) {
      const src = latest(state);
      const value = Reflect.get(src, prop);
      if (isDraftable(value) && !states.has(value) && value === state.base[prop as string]) {
        const child = createDraft(value as Obj, state, all);
        prepareCopy(state)[prop] = child;
        return child;
      }
      return value;
    },
    set(_t, prop, value) {
      const src = latest(state);
      if (Object.is(Reflect.get(src, prop), value) && (value !== undefined || prop in src)) return true;
      markChanged(state);
      state.copy![prop] = value;
      return true;
    },
    deleteProperty(_t, prop) {
      if (!(prop in latest(state))) return true;
      markChanged(state);
      delete state.copy![prop];
      return true;
    },
    has: (_t, prop) => prop in latest(state),
    ownKeys: () => Reflect.ownKeys(latest(state)),
    getOwnPropertyDescriptor(_t, prop) {
      const d = Reflect.getOwnPropertyDescriptor(latest(state), prop);
      if (!d) return undefined;
      return {
        writable: true,
        configurable: !(state.isArray && prop === "length"),
        enumerable: d.enumerable,
        value: handler.get!(_t, prop, state.proxy),
      };
    },
    defineProperty() {
      throw new Error("produce: defineProperty is not supported on drafts");
    },
    getPrototypeOf: () => Object.getPrototypeOf(state.base),
  };
  const { proxy, revoke } = Proxy.revocable((isArray ? [] : {}) as Obj, handler);
  state.proxy = proxy;
  state.revoke = revoke;
  states.set(proxy, state);
  all.push(state);
  return proxy;
}

function finalize(value: unknown, done: Map<DraftState, unknown>, seen: Set<unknown>): unknown {
  const s = typeof value === "object" && value !== null ? states.get(value) : undefined;
  if (s) {
    if (done.has(s)) return done.get(s);
    if (!s.modified) {
      done.set(s, s.base);
      return s.base;
    }
    const copy = s.copy!;
    done.set(s, copy);
    for (const k of Object.keys(copy)) {
      const v = copy[k];
      if (v !== s.base[k]) copy[k] = finalize(v, done, seen);
    }
    return copy;
  }
  // A new plain value supplied by the recipe may contain drafts.
  if (isDraftable(value) && !seen.has(value)) {
    seen.add(value);
    const o = value as Obj;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "object" && v !== null) {
        const f = finalize(v, done, seen);
        if (f !== v) o[k] = f;
      }
    }
  }
  return value;
}

export interface ProduceResult<T> {
  doc: T;
  patches: Patch[];
  inverse: Patch[];
}

/**
 * Run `recipe` on a mutable draft of `base` and return the new immutable value
 * plus forward and inverse patches. Untouched subtrees keep their identity.
 */
export function produce<T extends object>(base: T, recipe: (draft: T) => void): ProduceResult<T> {
  const all: DraftState[] = [];
  const root = createDraft(base as unknown as Obj, null, all);
  try {
    recipe(root as unknown as T);
    const doc = finalize(root, new Map(), new Set()) as T;
    return { doc, patches: diff(base, doc), inverse: diff(doc, base) };
  } finally {
    for (const s of all) s.revoke();
  }
}

/** Modify `base` with a recipe and return only the new value. */
export function update<T extends object>(base: T, recipe: (draft: T) => void): T {
  return produce(base, recipe).doc;
}
