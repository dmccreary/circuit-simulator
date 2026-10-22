// The file service (files-and-persistence.md §1, §5.4): which file the
// document came from, whether it has unsaved changes, open / save / share,
// and the unsaved-work guard (FIL-04). Autosave lives in ./autosave.ts.

import type { CircuitDocument, MessageRef } from "@cs/model";
import { produce, normalize } from "@cs/model";
import { getDescriptor } from "@cs/elements";
import {
  FormatError,
  decodeShareLink,
  encodeShareLink,
  isShareLinkTooLong,
  serializeCircuit,
  shareLinkFragment,
} from "@cs/formats";
import type { AppController } from "../controller";
import { t } from "../messages";
import { CIRCUIT_EXTENSION, type FilePlatform } from "./platform";
import { baseName, readCircuitText } from "./read-circuit";
import { parseStartupUrl, type StartupRequest } from "./startup-url";
import { createFilesUi, type FilesUi } from "./ui-state";

export const EXAMPLES_BASE = "./circuits/";

export interface OpenOptions {
  fileName?: string;
  handle?: unknown;
  notices?: MessageRef[];
  /** Skip the unsaved-work question (startup, recovery). */
  force?: boolean;
  /** Keep the document marked as changed (a recovered, never-saved circuit). */
  dirty?: boolean;
}

const msg = (e: unknown): string => (e instanceof FormatError ? t(e.ref) : e instanceof Error ? e.message : String(e));

export class FileSession {
  readonly ui: FilesUi = createFilesUi();
  fileName: string | undefined;
  handle: unknown;
  private savedDoc: CircuitDocument;
  /** A recovered circuit counts as unsaved even before its first edit. */
  private unsaved = false;
  private changeListeners = new Set<() => void>();
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly c: AppController,
    public platform: FilePlatform,
  ) {
    this.savedDoc = c.edits.doc;
    c.edits.onPatches((b) => {
      if (!b.provisional) for (const l of [...this.changeListeners]) l();
    });
  }

  get dirty(): boolean {
    return this.unsaved || this.c.edits.doc !== this.savedDoc;
  }

  /** Called after every committed change and every load. */
  onChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  get title(): string {
    return this.c.edits.doc.meta.title || (this.fileName ? baseName(this.fileName) : "") || "circuit";
  }

  // ------------------------------------------------------------ UI helpers

  notify(text: string, error = false): void {
    this.ui.set({ notice: { text, error } });
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.ui.set({ notice: null }), error ? 8000 : 4000);
  }

  ask(title: string, message: string, confirm: string, cancel = t("files.cancel")): Promise<boolean> {
    return new Promise((resolve) => {
      this.ui.set({
        dialog: {
          kind: "confirm",
          title,
          message,
          confirm,
          cancel,
          resolve: (ok) => {
            this.ui.set({ dialog: null });
            resolve(ok);
          },
        },
      });
    });
  }

  /** FIL-04: never discard unsaved work without asking. */
  async confirmDiscard(): Promise<boolean> {
    if (!this.dirty) return true;
    return this.ask(t("files.unsavedTitle"), t({ key: "files.unsavedBody", values: { title: this.title } }), t("files.discard"));
  }

  // ------------------------------------------------------------ opening

  /** Replace the current document. It loads PAUSED at t = 0 and is fitted to view. */
  async openDocument(doc: CircuitDocument, opts: OpenOptions = {}): Promise<boolean> {
    if (!opts.force && !(await this.confirmDiscard())) return false;
    const c = this.c;
    const ready = this.normalized(doc);
    c.pause();
    c.reset();
    c.store.set({ selection: [], tool: { id: "select" } });
    c.edits.load(ready);
    this.savedDoc = ready;
    this.unsaved = !!opts.dirty;
    this.fileName = opts.fileName;
    this.handle = opts.handle;
    if (c.schematic) {
      c.schematic.view.zoom = ready.view.zoom;
      c.schematic.view.center = ready.view.center;
    }
    c.fit();
    const lines = (opts.notices ?? []).map((n) => t(n));
    if (lines.length) this.ui.set({ dialog: { kind: "notices", title: t({ key: "files.openedWithNotices", values: { title: this.title } }), lines } });
    else this.notify(t({ key: "files.opened", values: { title: this.title } }));
    for (const l of [...this.changeListeners]) l();
    return true;
  }

  private normalized(doc: CircuitDocument): CircuitDocument {
    try {
      return produce(doc, (d) => normalize(d, this.c.resolver, { labelPrefix: (ty) => getDescriptor(ty)?.labelPrefix })).doc;
    } catch {
      return doc;
    }
  }

  /** Open file contents (native or Falstad text). */
  async openText(text: string, name?: string, handle?: unknown, opts: { force?: boolean } = {}): Promise<boolean> {
    try {
      const r = readCircuitText(text, { name, isKnownType: (ty) => this.c.resolver.traits(ty).known });
      // Only a native file can be saved back in place.
      const native = r.format === "native";
      return await this.openDocument(r.doc, {
        fileName: native ? name : undefined,
        handle: native ? handle : undefined,
        notices: r.notices,
        force: opts.force,
      });
    } catch (e) {
      this.notify(t({ key: "files.openFailed", values: { name: name ?? "", reason: msg(e) } }), true);
      return false;
    }
  }

  async open(): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    const f = await this.platform.pickOpen();
    if (f) await this.openText(f.text, f.name, f.handle, { force: true });
  }

  async openExample(file: string, opts: { force?: boolean } = {}): Promise<boolean> {
    if (!opts.force && !(await this.confirmDiscard())) return false;
    let text: string;
    try {
      text = await this.platform.fetchText(EXAMPLES_BASE + encodeURIComponent(file));
    } catch (e) {
      this.notify(t({ key: "files.exampleMissing", values: { name: file, reason: msg(e) } }), true);
      return false;
    }
    return this.openText(text, file, undefined, { force: true });
  }

  /** Startup: open whatever the page address names (share link, example, Falstad link, circuit URL). */
  async openFromUrl(href: string): Promise<StartupRequest | null> {
    const req = parseStartupUrl(href);
    if (!req) return null;
    try {
      if (req.kind === "share") {
        // FIL-07: a share link always opens a copy; the link itself never changes.
        await this.openDocument(await decodeShareLink(req.payload), { force: true });
      } else if (req.kind === "example") {
        await this.openExample(req.file, { force: true });
      } else if (req.kind === "falstad") {
        await this.openText(req.text, undefined, undefined, { force: true });
      } else {
        const text = await this.platform.fetchText(req.url);
        await this.openText(text, req.url.split(/[?#]/)[0].split("/").pop() || undefined, undefined, { force: true });
      }
    } catch (e) {
      this.notify(t({ key: "files.linkFailed", values: { reason: msg(e) } }), true);
    }
    return req;
  }

  // ------------------------------------------------------------ saving

  fileText(): string {
    const doc = this.c.edits.doc;
    const netlist = this.c.compiled?.netlist;
    const summary: Record<string, string[]> = {};
    for (const el of netlist?.elements ?? []) {
      const part = doc.parts[el.id];
      if (!part) continue;
      summary[part.label || el.id] = el.nodes.map((n) => netlist!.nodeNames[n] ?? String(n));
    }
    return serializeCircuit(doc, { netlistSummary: summary });
  }

  private suggestedName(): string {
    const base = (this.fileName ? baseName(this.fileName) : this.title).replace(/[\\/:*?"<>|]+/g, "-").trim() || "circuit";
    return base + CIRCUIT_EXTENSION;
  }

  async save(asNew = false): Promise<boolean> {
    const doc = this.c.edits.doc;
    try {
      const r = await this.platform.save(this.fileText(), this.suggestedName(), asNew ? undefined : this.handle);
      if (!r) return false;
      this.fileName = r.name;
      this.handle = r.handle;
      this.savedDoc = doc;
      this.unsaved = false;
      this.notify(t({ key: "files.saved", values: { name: r.name } }));
      for (const l of [...this.changeListeners]) l();
      return true;
    } catch (e) {
      this.notify(t({ key: "files.saveFailed", values: { reason: msg(e) } }), true);
      return false;
    }
  }

  // ------------------------------------------------------------ sharing

  baseUrl(): string {
    const l = globalThis.location;
    return l ? `${l.origin}${l.pathname}` : "";
  }

  /** FIL-05/06: copy a link carrying the whole circuit; warn and offer a file above 8,000 characters. */
  async share(): Promise<string | undefined> {
    let payload: string;
    try {
      payload = await encodeShareLink(this.c.edits.doc);
    } catch (e) {
      this.notify(t({ key: "files.shareFailed", values: { reason: msg(e) } }), true);
      return undefined;
    }
    const base = this.baseUrl();
    const url = base + shareLinkFragment(payload);
    if (isShareLinkTooLong(payload, base.length)) {
      const saveInstead = await this.ask(
        t("files.longLinkTitle"),
        t({ key: "files.longLinkBody", values: { length: url.length.toLocaleString("en-US") } }),
        t("files.saveInstead"),
        t("files.copyAnyway"),
      );
      if (saveInstead) {
        await this.save();
        return undefined;
      }
    }
    if (await this.platform.copyText(url)) this.notify(t("files.linkCopied"));
    else this.ui.set({ dialog: { kind: "link", url } });
    return url;
  }
}
