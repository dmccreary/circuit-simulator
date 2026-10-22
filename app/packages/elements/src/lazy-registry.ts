// A registry of plug-ins (models or views) by part type: Essentials given up
// front, other groups loaded on demand (circuit-model.md §5.4). Shared by
// models.ts (worker) and views.ts (main thread).

import { groupOf } from "./descriptors";
import { LAZY_GROUPS, type LazyGroup } from "./groups";

export class LazyRegistry<T> {
  private readonly items: Record<string, T>;
  private readonly loaded = new Set<LazyGroup>();
  private readonly pending = new Map<LazyGroup, Promise<void>>();
  private readonly listeners = new Set<(types: string[]) => void>();

  constructor(
    essentials: Record<string, T>,
    private readonly loaders: Record<LazyGroup, () => Promise<Record<string, T>>>,
  ) {
    this.items = { ...essentials };
  }

  get(type: string): T | undefined {
    return Object.prototype.hasOwnProperty.call(this.items, type) ? this.items[type] : undefined;
  }

  /** Lazy groups these types need that are not loaded yet. */
  missing(types: Iterable<string>): LazyGroup[] {
    const out = new Set<LazyGroup>();
    for (const t of types) {
      const g = groupOf(t);
      if (g && g !== "essentials" && !this.loaded.has(g)) out.add(g);
    }
    return [...out];
  }

  /** Resolves once every listed type's group is loaded (at once when nothing is missing). */
  ensure(types: Iterable<string>): Promise<void> {
    const groups = this.missing(types);
    return groups.length === 0 ? Promise.resolve() : Promise.all(groups.map((g) => this.load(g))).then(() => undefined);
  }

  loadAll(): Promise<void> {
    return Promise.all(LAZY_GROUPS.map((g) => this.load(g))).then(() => undefined);
  }

  /** Called with the group's types after each group loads. */
  onLoaded(fn: (types: string[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private load(g: LazyGroup): Promise<void> {
    if (this.loaded.has(g)) return Promise.resolve();
    let p = this.pending.get(g);
    if (!p) {
      p = this.loaders[g]().then(
        (record) => {
          Object.assign(this.items, record);
          this.loaded.add(g);
          this.pending.delete(g);
          const types = Object.keys(record);
          for (const fn of this.listeners) fn(types);
        },
        (err: unknown) => {
          this.pending.delete(g); // let a later call retry (offline, flaky network)
          throw err;
        },
      );
      this.pending.set(g, p);
    }
    return p;
  }
}
