// My circuits (FIL-08): circuits kept in this browser's storage, each with a
// name, a thumbnail and the time it last changed. Pure operations over the
// persistence `circuits` store, so they run against the in-memory backend in tests.

import type { CircuitRecord, Persistence } from "@cs/persistence";

export interface SaveInput {
  id?: string;
  name: string;
  text: string;
  thumbnailSvg?: string;
}

export interface MyCircuitsDeps {
  persistence: Persistence;
  now?: () => number;
  newId?: () => string;
}

const defaultId = () => `mc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class MyCircuitsStore {
  constructor(private deps: MyCircuitsDeps) {}

  private get store() {
    return this.deps.persistence.circuits;
  }
  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  /** Newest first. */
  async list(): Promise<CircuitRecord[]> {
    return (await this.store.values()).sort((a, b) => b.changedAt - a.changedAt);
  }

  get(id: string): Promise<CircuitRecord | undefined> {
    return this.store.get(id);
  }

  /** Add or replace an entry; returns its id. */
  async save(input: SaveInput): Promise<string> {
    const id = input.id ?? (this.deps.newId ?? defaultId)();
    const rec: CircuitRecord = { id, name: input.name.trim() || "Untitled circuit", text: input.text, changedAt: this.now() };
    if (input.thumbnailSvg) rec.thumbnailSvg = input.thumbnailSvg;
    await this.store.put(id, rec);
    return id;
  }

  async rename(id: string, name: string): Promise<boolean> {
    const rec = await this.store.get(id);
    const clean = name.trim();
    if (!rec || !clean) return false;
    await this.store.put(id, { ...rec, name: clean, changedAt: this.now() });
    return true;
  }

  /** A copy named "… (copy)", or undefined when the entry is gone. */
  async duplicate(id: string, copyName: (name: string) => string = (n) => `${n} (copy)`): Promise<string | undefined> {
    const rec = await this.store.get(id);
    if (!rec) return undefined;
    return this.save({ name: copyName(rec.name), text: rec.text, thumbnailSvg: rec.thumbnailSvg });
  }

  remove(id: string): Promise<void> {
    return this.store.delete(id);
  }
}
