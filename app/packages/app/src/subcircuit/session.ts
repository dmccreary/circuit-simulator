// Subcircuits in the interface (EDT-34–38): make one from the selection,
// look inside (a breadcrumb trail of nested views), edit one copy or all,
// seal as a black box, and keep definitions in the My parts palette.

import type { CircuitDocument, PinSide, Point } from "@cs/model";
import {
  bundleDefinition,
  definitionOf,
  insertBundle,
  instancePart,
  instancesOf,
  makeSubcircuit,
  newId,
  produce,
  separateInstance,
  setSealed,
  type DefinitionBundle,
} from "@cs/model";
import { getDescriptor } from "@cs/elements";
import type { SubcircuitRecord } from "@cs/persistence";
import type { AppController } from "../controller";
import { t } from "../messages";
import { createStore, type Store } from "../store";
import { nextLabel } from "../tools/route";
import { storageOf } from "../my-circuits/storage";
import { SheetLens, type SheetFrame } from "./lens";

export interface ProposedPin {
  name: string;
  side: PinSide;
}

export type SubcircuitDialog =
  | { kind: "make"; ids: string[]; name: string; pins: ProposedPin[] }
  | { kind: "scope"; instance: string; copies: number }
  | null;

export interface SubcircuitUi {
  /** Breadcrumb trail; empty at the top level. */
  path: SheetFrame[];
  dialog: SubcircuitDialog;
  /** My parts entries; null until loaded. */
  myParts: SubcircuitRecord[] | null;
}

export class SubcircuitSession {
  readonly ui: Store<SubcircuitUi> = createStore<SubcircuitUi>({ path: [], dialog: null, myParts: null });

  constructor(readonly c: AppController) {
    c.edits.onPatches((b) => {
      if (b.source === "load") return this.goTo(0);
      // Undo may remove the instance we are looking inside.
      const path = this.ui.get().path;
      if (path.length && c.sheet && !c.sheet.view(c.edits.doc)) this.goTo(0);
    });
  }

  private lensOpts() {
    return { resolver: this.c.resolver, labelPrefix: (ty: string) => getDescriptor(ty)?.labelPrefix };
  }

  // ------------------------------------------------------------ navigation

  /** The selected subcircuit instance on the current sheet, if exactly one is selected. */
  selectedInstance(): { id: string; definition: string } | undefined {
    const sel = this.c.store.get().selection;
    if (sel.length !== 1) return undefined;
    const part = this.c.sheetDoc().parts[sel[0]];
    const def = definitionOf(part);
    return def && this.c.edits.doc.subcircuits[def] ? { id: part!.id, definition: def } : undefined;
  }

  canLookInside(id?: string): boolean {
    const part = id ? this.c.sheetDoc().parts[id] : undefined;
    const def = id ? definitionOf(part) : this.selectedInstance()?.definition;
    const d = def ? this.c.edits.doc.subcircuits[def] : undefined;
    return !!d && !d.sealed;
  }

  /** EDT-36/38: open the instance's inside, first asking "every copy or only this one" when it has copies. */
  lookInside(id?: string): boolean {
    const instance = id ?? this.selectedInstance()?.id;
    if (!instance || !this.canLookInside(instance)) return false;
    const defId = definitionOf(this.c.sheetDoc().parts[instance])!;
    const copies = instancesOf(this.c.edits.doc, defId).length;
    if (copies > 1) {
      this.ui.set({ dialog: { kind: "scope", instance, copies } });
      return true;
    }
    this.enter(instance);
    return true;
  }

  /** Answer to the scope question: "all" edits the shared definition, "one" splits this instance off first. */
  chooseScope(scope: "all" | "one" | "cancel"): void {
    const d = this.ui.get().dialog;
    this.ui.set({ dialog: null });
    if (!d || d.kind !== "scope" || scope === "cancel") return;
    if (scope === "one") {
      const sheet = this.ui.get().path.at(-1)?.definition ?? null;
      this.c.edits.edit({ key: "subcircuit.editOne" }, (doc) => void separateInstance(doc, sheet, d.instance, newId));
    }
    this.enter(d.instance);
  }

  enter(instance: string): void {
    const part = this.c.sheetDoc().parts[instance];
    const definition = definitionOf(part);
    if (!part || !definition) return;
    const path = [...this.ui.get().path, { instance, definition, label: part.label || part.id }];
    this.ui.set({ path });
    this.c.setSheet(new SheetLens(path, this.lensOpts()));
    this.c.fit();
  }

  /** Breadcrumb: 0 is the whole circuit. */
  goTo(depth: number): void {
    const old = this.ui.get().path;
    if (depth >= old.length) return;
    const path = old.slice(0, depth);
    this.ui.set({ path });
    this.c.setSheet(path.length ? new SheetLens(path, this.lensOpts()) : undefined);
    // Edits made inside reach My parts when leaving the definition.
    for (const f of old.slice(depth)) void this.refreshMyPart(f.definition);
  }

  exit(): void {
    this.goTo(this.ui.get().path.length - 1);
  }

  // ------------------------------------------------------------ making

  /** Points on the current sheet that already lead outside it (the enclosing definition's pins). */
  private outerPins(): Point[] {
    const def = this.ui.get().path.at(-1)?.definition;
    return def ? (this.c.edits.doc.subcircuits[def]?.pins.map((p) => p.at) ?? []) : [];
  }

  /** The pins a selection would get, for the naming dialog; undefined when nothing can be made. */
  propose(ids: string[]): ProposedPin[] | undefined {
    let pins: ProposedPin[] | undefined;
    produce(this.c.sheetDoc(), (d) => {
      const r = makeSubcircuit(d, ids, { resolver: this.c.resolver, newId, name: "", label: "U", extraAnchors: this.outerPins() });
      if (r.ok) pins = r.pins;
    });
    return pins;
  }

  openMakeDialog(): boolean {
    const ids = this.c.store.get().selection;
    const pins = this.propose(ids);
    if (!pins) return false;
    this.ui.set({ dialog: { kind: "make", ids, name: t("subcircuit.defaultName"), pins } });
    return true;
  }

  /** EDT-34: replace the selection with a block. Returns the new instance id. */
  make(ids: string[], name: string, pins?: ProposedPin[]): string | undefined {
    let instance: string | undefined;
    let definition: string | undefined;
    this.c.editSheet({ key: "subcircuit.make" }, (d) => {
      const label = nextLabel(d, "U");
      const r = makeSubcircuit(d, ids, { resolver: this.c.resolver, newId, name, label, extraAnchors: this.outerPins(), pins });
      if (!r.ok) return;
      d.parts[r.instance].props.name = name;
      instance = r.instance;
      definition = r.definition;
    });
    if (instance) {
      this.c.store.set({ selection: [instance] });
      if (definition) void this.saveToMyParts(definition);
    }
    return instance;
  }

  // ------------------------------------------------------------ black boxes

  toggleSeal(defId?: string): void {
    const def = defId ?? this.selectedInstance()?.definition;
    if (!def) return;
    const sealed = !this.c.edits.doc.subcircuits[def]?.sealed;
    this.c.edits.edit({ key: sealed ? "subcircuit.seal" : "subcircuit.unseal" }, (d) => setSealed(d, def, sealed));
  }

  // ------------------------------------------------------------ My parts (EDT-35)

  async loadMyParts(): Promise<SubcircuitRecord[]> {
    try {
      const { persistence } = await storageOf(this.c);
      const list = (await persistence.subcircuits.values()).sort((a, b) => a.name.localeCompare(b.name));
      this.ui.set({ myParts: list });
      return list;
    } catch {
      this.ui.set({ myParts: [] });
      return [];
    }
  }

  async saveToMyParts(defId: string): Promise<boolean> {
    const bundle = bundleDefinition(this.c.edits.doc, defId);
    if (!bundle) return false;
    try {
      const { persistence } = await storageOf(this.c);
      const def = bundle.definitions[defId];
      await persistence.subcircuits.put(defId, { id: defId, name: def.name, definition: bundle, changedAt: Date.now() });
      await this.loadMyParts();
      return true;
    } catch {
      return false;
    }
  }

  /** Re-save a definition that is already in My parts (after editing inside it). */
  private async refreshMyPart(defId: string): Promise<void> {
    try {
      const { persistence } = await storageOf(this.c);
      if (await persistence.subcircuits.get(defId)) await this.saveToMyParts(defId);
    } catch {
      // storage unavailable: the definition still lives in the circuit file
    }
  }

  async removeMyPart(id: string): Promise<void> {
    const { persistence } = await storageOf(this.c);
    await persistence.subcircuits.delete(id);
    await this.loadMyParts();
  }

  /** Place a My parts definition (copied into this circuit) on the current sheet. */
  place(bundle: DefinitionBundle, at: Point): string | undefined {
    let id: string | undefined;
    this.c.editSheet({ key: "edit.place", values: { type: "subcircuit" } }, (d: CircuitDocument) => {
      insertBundle(d, bundle);
      const def = d.subcircuits[bundle.root];
      if (!def) return;
      id = newId("p");
      d.parts[id] = instancePart(def, id, nextLabel(d, "U"), at);
      d.parts[id].props.name = def.name;
    });
    if (id) this.c.store.set({ selection: [id] });
    return id;
  }

  /** Bundle for a palette entry: stored in My parts, or a definition already in this circuit. */
  bundleFor(id: string): DefinitionBundle | undefined {
    const rec = this.ui.get().myParts?.find((r) => r.id === id);
    const b = rec?.definition as DefinitionBundle | undefined;
    if (b && b.root && b.definitions?.[b.root]) return b;
    return bundleDefinition(this.c.edits.doc, id);
  }
}

const sessions = new WeakMap<AppController, SubcircuitSession>();

export function subcircuitsOf(c: AppController): SubcircuitSession {
  let s = sessions.get(c);
  if (!s) {
    s = new SubcircuitSession(c);
    sessions.set(c, s);
  }
  return s;
}
