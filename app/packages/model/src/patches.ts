// Patch application and diffing over plain immutable objects with structural sharing.
import type { Patch, PatchPath } from "./types";

type Container = Record<string | number, unknown> | unknown[];

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function isDraftable(v: unknown): v is Container {
  return Array.isArray(v) || isPlainObject(v);
}

function shallowCopy<T>(v: T): T {
  return (Array.isArray(v) ? v.slice() : { ...(v as object) }) as T;
}

/**
 * Apply patches without mutating `base`. Only the objects along each patch
 * path are copied; every untouched subtree keeps its identity.
 */
export function applyPatches<T>(base: T, patches: readonly Patch[]): T {
  if (patches.length === 0) return base;
  const fresh = new Set<unknown>();
  let root: unknown = base;

  const own = (v: unknown): Container => {
    if (fresh.has(v)) return v as Container;
    const c = shallowCopy(v) as Container;
    fresh.add(c);
    return c;
  };

  for (const p of patches) {
    if (p.path.length === 0) {
      if (p.op === "set") root = p.value;
      continue;
    }
    if (!isDraftable(root)) throw new Error("applyPatches: root is not an object");
    root = own(root);
    let parent = root as Container;
    for (let i = 0; i < p.path.length - 1; i++) {
      const k = p.path[i];
      const child = (parent as Record<string | number, unknown>)[k];
      let next: Container;
      if (isDraftable(child)) next = own(child);
      else {
        // Create missing intermediate containers, like a deep "set".
        next = typeof p.path[i + 1] === "number" ? [] : {};
        fresh.add(next);
      }
      (parent as Record<string | number, unknown>)[k] = next;
      parent = next;
    }
    const last = p.path[p.path.length - 1];
    if (p.op === "set") (parent as Record<string | number, unknown>)[last] = p.value;
    else if (Array.isArray(parent) && typeof last === "number") parent.splice(last, 1);
    else delete (parent as Record<string | number, unknown>)[last];
  }
  return root as T;
}

/**
 * Patches that turn `a` into `b`. Relies on structural sharing: identical
 * references are skipped without descending. Arrays whose length changed are
 * replaced whole, so the output never contains an array-index delete and is
 * therefore idempotent.
 */
export function diff(a: unknown, b: unknown, path: PatchPath = [], out: Patch[] = []): Patch[] {
  if (Object.is(a, b)) return out;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push({ op: "set", path, value: b });
    else for (let i = 0; i < a.length; i++) diff(a[i], b[i], [...path, i], out);
    return out;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    for (const k of Object.keys(a)) if (!(k in b)) out.push({ op: "delete", path: [...path, k] });
    for (const k of Object.keys(b)) {
      if (!(k in a)) out.push({ op: "set", path: [...path, k], value: b[k] });
      else diff(a[k], b[k], [...path, k], out);
    }
    return out;
  }
  out.push({ op: "set", path, value: b });
  return out;
}
