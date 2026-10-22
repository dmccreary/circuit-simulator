import type { CircuitDocument } from "@cs/model";
import { encodeShareLink, shareLinkFragment } from "@cs/formats";
import type { AppController } from "../controller";
import { createStore, type Store } from "../store";
import { capabilitiesFor, commandCapability, granted, patchAllowed, type Capabilities } from "./capabilities";
import { trackChanges, type CommittedChange } from "./changes";
import type { EmbedConfig, PanelId } from "./params";

export interface EmbedState {
  caps: Capabilities;
  warnings: string[];
  /** "Activity recording on" indicator (XAP-03). */
  recording: boolean;
  /** Message shown briefly after a refused change. */
  notice?: string;
}

export interface RuntimeOptions {
  /** Identifies the circuit for xAPI; defaults to the example, circuit URL, or "default". */
  sourceId?: string;
  /** The simulator's own address, used for "Open in full simulator". */
  href: string;
  openWindow?: (url: string) => void;
}

/**
 * Embed state for one simulator instance: the capability set, the circuit as
 * published (for Reset to original), the command gate, and the guard that
 * refuses document changes the mode does not grant (EMB-02..04).
 */
export class EmbedRuntime {
  readonly state: Store<EmbedState>;
  sourceId: string;
  private original: CircuitDocument;
  private trusted = 0;
  private reverting = false;
  private listeners = new Set<(c: CommittedChange) => void>();
  private disposers: Array<() => void> = [];

  constructor(
    readonly c: AppController,
    readonly config: EmbedConfig,
    private opts: RuntimeOptions,
  ) {
    this.sourceId = opts.sourceId ?? sourceIdFor(config);
    this.original = c.edits.doc;
    this.state = createStore<EmbedState>({ caps: capabilitiesFor(config), warnings: [...config.warnings], recording: false });
    c.commands.setGate((cmd) => granted(this.caps, commandCapability(cmd)));
    this.registerCommands();
    this.disposers.push(
      trackChanges(c.edits, (ch) => this.handleChange(ch)),
      () => c.commands.setGate(undefined),
    );
  }

  get caps(): Capabilities {
    return this.state.get().caps;
  }

  /** Embedded in another page, so the embed controls show. */
  get embedded(): boolean {
    return this.config.embedded;
  }

  setCapabilities(caps: Capabilities): void {
    this.state.set({ caps });
    this.c.commands.setGate((cmd) => granted(this.caps, commandCapability(cmd)));
    const tool = this.c.store.get().tool;
    const toolId = tool.id === "place" ? "place" : tool.id;
    if (!caps.tools.includes(toolId)) this.c.setTool({ id: "select" });
  }

  panelVisible(p: PanelId): boolean {
    return this.caps.panels.includes(p);
  }

  /** Accepted, finished document changes (xAPI, the bridge's circuitChanged). */
  onChange(fn: (c: CommittedChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private handleChange(ch: CommittedChange): void {
    if (this.reverting) return;
    // Any load (startup URL, File > Open, host loadCircuit) is the new "as published" circuit.
    if (ch.source === "load") this.original = ch.after;
    const guarded = (ch.source === "edit" || ch.source === "redo") && this.trusted === 0;
    if (guarded && !ch.patches.every((p) => patchAllowed(this.caps, p, ch.before))) {
      this.reverting = true;
      try {
        this.c.edits.undo();
      } finally {
        this.reverting = false;
      }
      this.state.set({ notice: this.caps.edit === "none" ? "This circuit is view-only." : "That change is not allowed here." });
      return;
    }
    for (const l of this.listeners) l(ch);
  }

  /** Run document edits on behalf of the host page or the embed itself, bypassing locks. */
  asTrusted<T>(fn: () => T): T {
    this.trusted++;
    try {
      return fn();
    } finally {
      this.trusted--;
    }
  }

  /** EMB-04: restore the circuit as published, as one undoable transaction. */
  resetToOriginal(): void {
    const orig = this.original;
    this.c.pause();
    this.asTrusted(() =>
      this.c.edits.edit({ key: "embed.resetOriginal" }, (d) => {
        const draft = d as unknown as Record<string, unknown>;
        for (const k of Object.keys(draft)) if (!(k in orig)) delete draft[k];
        for (const [k, v] of Object.entries(orig)) draft[k] = v;
      }),
    );
    this.c.reset();
    this.c.store.set({ selection: [] });
    this.c.fit();
  }

  /** EMB-03: a share link to the current circuit, including the reader's changes, in edit mode. */
  async fullSimulatorUrl(): Promise<string> {
    const base = this.opts.href.replace(/[?#].*$/, "");
    return `${base}?mode=edit${shareLinkFragment(await encodeShareLink(this.c.edits.doc))}`;
  }

  async openFullSimulator(): Promise<void> {
    const url = await this.fullSimulatorUrl();
    (this.opts.openWindow ?? ((u: string) => window.open(u, "_blank", "noopener")))(url);
  }

  /** Height the host should give the iframe so nothing scrolls inside it (EMB-08). */
  preferredHeight(): number {
    if (this.config.height) return this.config.height;
    const p = this.caps.panels;
    const lanes = Math.max(1, this.c.edits.doc.lanes.length);
    let h = 300; // schematic
    if (p.includes("topbar")) h += 46;
    if (p.includes("chart")) h += 140 + 90 * lanes;
    if (p.includes("status")) h += 24;
    if (this.embedded) h += 34; // embed control strip
    return Math.min(1200, h);
  }

  dismissNotice(): void {
    this.state.set({ notice: undefined });
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }

  private registerCommands(): void {
    const r = this.c.commands;
    if (!r.get("embed.resetOriginal"))
      r.register({ id: "embed.resetOriginal", label: { key: "embed.resetOriginal" }, run: () => this.resetToOriginal() });
    if (!r.get("embed.openFull"))
      r.register({ id: "embed.openFull", label: { key: "embed.openFull" }, run: () => this.openFullSimulator() });
  }
}

/** The circuit's stable name for activity ids (XAP-07). */
export function sourceIdFor(cfg: Partial<Pick<EmbedConfig, "example" | "circuit" | "c" | "ctz">>, fallback = "default"): string {
  if (cfg.example) return cfg.example;
  if (cfg.circuit) return cfg.circuit.replace(/[?#].*$/, "");
  if (cfg.c || cfg.ctz) return "share-link";
  return fallback;
}
