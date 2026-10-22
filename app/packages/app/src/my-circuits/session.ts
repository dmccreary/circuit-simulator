// The My circuits feature on one controller: save the open circuit to the
// browser's list, open, rename, duplicate and delete entries (FIL-08).

import { parseCircuit, serializeCircuitCompact } from "@cs/formats";
import type { CircuitRecord } from "@cs/persistence";
import { getDescriptor, terminalPositions } from "@cs/elements";
import type { AppController } from "../controller";
import { filesOf } from "../files/install";
import { t } from "../messages";
import { createStore, type Store } from "../store";
import { requestPersistentStorage, storageOf } from "./storage";
import { MyCircuitsStore } from "./store";
import { thumbnailSvg } from "./thumbnail";

export interface MyCircuitsUi {
  /** Entries, newest first; null until loaded. */
  list: CircuitRecord[] | null;
  /** The entry the open circuit was saved to or opened from. */
  currentId: string | undefined;
  /** Storage that lasts only for this page (IndexedDB blocked). */
  temporary: boolean;
  error: string | undefined;
}

export class MyCircuitsSession {
  readonly ui: Store<MyCircuitsUi> = createStore<MyCircuitsUi>({ list: null, currentId: undefined, temporary: false, error: undefined });
  private persistAsked = false;

  constructor(readonly c: AppController) {}

  private async store(): Promise<MyCircuitsStore> {
    const { persistence, durable } = await storageOf(this.c);
    this.ui.set({ temporary: !durable });
    return new MyCircuitsStore({ persistence });
  }

  async refresh(): Promise<CircuitRecord[]> {
    try {
      const list = await (await this.store()).list();
      this.ui.set({ list, error: undefined });
      return list;
    } catch (e) {
      this.ui.set({ list: [], error: (e as Error).message });
      return [];
    }
  }

  thumbnail(): string {
    return thumbnailSvg(this.c.edits.doc, (p) => {
      const d = getDescriptor(p.type);
      return d ? terminalPositions(p, d) : [p.at];
    });
  }

  /** File → Save to My circuits: updates the entry this circuit came from, else adds one. */
  async saveCurrent(): Promise<string | undefined> {
    const files = filesOf(this.c);
    try {
      const store = await this.store();
      const id = await store.save({
        id: this.ui.get().currentId,
        name: files.title,
        text: serializeCircuitCompact(this.c.edits.doc),
        thumbnailSvg: this.thumbnail(),
      });
      this.ui.set({ currentId: id });
      await this.refresh();
      // The first save asks the browser to keep the list, and says where it lives (FIL-08).
      if (!this.persistAsked) {
        this.persistAsked = true;
        void requestPersistentStorage();
        files.notify(t({ key: "myCircuits.savedFirst", values: { name: files.title } }));
      } else files.notify(t({ key: "myCircuits.saved", values: { name: files.title } }));
      return id;
    } catch (e) {
      files.notify(t({ key: "myCircuits.failed", values: { reason: (e as Error).message } }), true);
      return undefined;
    }
  }

  async open(id: string): Promise<boolean> {
    const files = filesOf(this.c);
    const rec = await (await this.store()).get(id);
    if (!rec) return false;
    try {
      const { doc, notices } = parseCircuit(rec.text);
      if (!doc.meta.title) doc.meta.title = rec.name;
      const ok = await files.openDocument(doc, { notices });
      if (ok) this.ui.set({ currentId: id });
      return ok;
    } catch (e) {
      files.notify(t({ key: "files.openFailed", values: { name: rec.name, reason: (e as Error).message } }), true);
      return false;
    }
  }

  async rename(id: string, name: string): Promise<void> {
    await (await this.store()).rename(id, name);
    await this.refresh();
  }

  async duplicate(id: string): Promise<string | undefined> {
    const copy = await (await this.store()).duplicate(id, (n) => t({ key: "myCircuits.copyName", values: { name: n } }));
    await this.refresh();
    return copy;
  }

  async remove(id: string): Promise<void> {
    await (await this.store()).remove(id);
    if (this.ui.get().currentId === id) this.ui.set({ currentId: undefined });
    await this.refresh();
  }
}

const sessions = new WeakMap<AppController, MyCircuitsSession>();

export function myCircuitsOf(c: AppController): MyCircuitsSession {
  let s = sessions.get(c);
  if (!s) {
    s = new MyCircuitsSession(c);
    sessions.set(c, s);
  }
  return s;
}
