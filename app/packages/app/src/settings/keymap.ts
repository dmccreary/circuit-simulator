import type { CommandId, CommandRegistry } from "../commands/registry";
import { normalizeChord } from "../commands/keymap";

/** Learner key overrides: command id -> chords. Commands not listed keep their default keys. */
export type KeyOverrides = Record<CommandId, string[]>;

/** Rebind every command to its override or its default keys (SET-06). */
export function applyKeymap<C>(r: CommandRegistry<C>, overrides: KeyOverrides): void {
  for (const cmd of r.list()) {
    for (const k of r.keysFor(cmd.id)) r.unbind(k, cmd.id);
    for (const k of overrides[cmd.id] ?? cmd.defaultKeys ?? []) r.bind(k, cmd.id);
  }
}

/** Other commands already bound to `chord`. */
export function conflictsFor<C>(r: CommandRegistry<C>, chord: string, id: CommandId, mac: boolean): CommandId[] {
  const c = normalizeChord(chord, mac);
  return r
    .list()
    .filter((cmd) => cmd.id !== id && r.keysFor(cmd.id).includes(c))
    .map((cmd) => cmd.id);
}

/**
 * Give `id` the key `chord`. With `steal`, the chord is taken from the
 * commands that had it; without, the caller must have checked conflictsFor.
 */
export function assignKey<C>(r: CommandRegistry<C>, overrides: KeyOverrides, id: CommandId, chord: string, mac: boolean, steal: boolean): KeyOverrides {
  const next: KeyOverrides = { ...overrides };
  const c = normalizeChord(chord, mac);
  if (steal) {
    for (const other of conflictsFor(r, chord, id, mac)) next[other] = r.keysFor(other).filter((k) => k !== c);
  }
  next[id] = [c];
  return next;
}

/** Back to the default keys for one command, or for all when id is omitted. */
export function resetKeys(overrides: KeyOverrides, id?: CommandId): KeyOverrides {
  if (!id) return {};
  const next = { ...overrides };
  delete next[id];
  return next;
}
