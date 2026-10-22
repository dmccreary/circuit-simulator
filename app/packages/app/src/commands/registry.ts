import type { MessageRef } from "@cs/model";
import { chordFromEvent, normalizeChord, type KeyChord, type KeyEventLike } from "./keymap";

export type CommandId = string;

export interface Command<Ctx> {
  id: CommandId;
  label: MessageRef;
  defaultKeys?: KeyChord[];
  /** Visible and enabled. */
  when?: (ctx: Ctx) => boolean;
  /** Required permission (app-shell.md §6); the gate decides. Inferred from the id when absent. */
  capability?: string;
  run(ctx: Ctx, args?: unknown): void | Promise<void>;
}

export interface KeyConflict {
  chord: string;
  commands: CommandId[];
}

/**
 * The one place every action is registered (app-shell.md §2). Menus,
 * toolbars and the keyboard map are all built from it.
 */
export class CommandRegistry<Ctx> {
  private commands = new Map<CommandId, Command<Ctx>>();
  private keys = new Map<string, CommandId[]>();
  private listeners = new Set<(id: CommandId, args?: unknown) => void>();

  constructor(
    private ctx: () => Ctx,
    private mac = false,
  ) {}

  register(cmd: Command<Ctx>): void {
    if (this.commands.has(cmd.id)) throw new Error(`Command ${cmd.id} registered twice`);
    this.commands.set(cmd.id, cmd);
    for (const k of cmd.defaultKeys ?? []) this.bind(k, cmd.id);
  }

  bind(chord: KeyChord, id: CommandId): void {
    const c = normalizeChord(chord, this.mac);
    const list = this.keys.get(c) ?? [];
    if (!list.includes(id)) list.push(id);
    this.keys.set(c, list);
  }

  unbind(chord: KeyChord, id?: CommandId): void {
    const c = normalizeChord(chord, this.mac);
    if (!id) this.keys.delete(c);
    else this.keys.set(c, (this.keys.get(c) ?? []).filter((x) => x !== id));
  }

  /** Chords bound to more than one command (SET-06). */
  conflicts(): KeyConflict[] {
    return [...this.keys].filter(([, ids]) => ids.length > 1).map(([chord, commands]) => ({ chord, commands }));
  }

  get(id: CommandId): Command<Ctx> | undefined {
    return this.commands.get(id);
  }

  list(): Command<Ctx>[] {
    return [...this.commands.values()];
  }

  keysFor(id: CommandId): string[] {
    return [...this.keys].filter(([, ids]) => ids.includes(id)).map(([c]) => c);
  }

  /** Capability gate (embed modes, lessons). Commands it refuses are hidden and cannot run. */
  private gate: ((cmd: Command<Ctx>) => boolean) | undefined;
  private gateListeners = new Set<() => void>();

  setGate(gate: ((cmd: Command<Ctx>) => boolean) | undefined): void {
    this.gate = gate;
    for (const l of this.gateListeners) l();
  }

  onGateChange(fn: () => void): () => void {
    this.gateListeners.add(fn);
    return () => this.gateListeners.delete(fn);
  }

  /** Granted by the capability set, so it should be shown. */
  allowed(id: CommandId): boolean {
    const c = this.commands.get(id);
    return !!c && (this.gate?.(c) ?? true);
  }

  enabled(id: CommandId): boolean {
    const c = this.commands.get(id);
    return !!c && this.allowed(id) && (c.when?.(this.ctx()) ?? true);
  }

  run(id: CommandId, args?: unknown): boolean {
    const c = this.commands.get(id);
    if (!c || !this.enabled(id)) return false;
    void c.run(this.ctx(), args);
    for (const l of this.listeners) l(id, args);
    return true;
  }

  /** Executed-command stream (xAPI, lessons). */
  onRun(fn: (id: CommandId, args?: unknown) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Run the first enabled command bound to the event's chord. */
  handleKey(e: KeyEventLike): CommandId | undefined {
    for (const id of this.keys.get(chordFromEvent(e)) ?? []) if (this.run(id)) return id;
    return undefined;
  }
}

/** True when keystrokes belong to a text field, not to the canvas shortcuts. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean; type?: string } | null;
  if (!el?.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !["checkbox", "radio", "button", "range"].includes(el.type ?? "");
}
