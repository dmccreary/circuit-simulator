/** A key chord such as "Mod+Shift+Z", "Space", "Delete". "Mod" is Cmd on Mac, Ctrl elsewhere. */
export type KeyChord = string;

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const MOD_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;

export const isMacPlatform = (): boolean =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function normalizeKey(k: string): string {
  if (k === " " || k === "Spacebar") return "Space";
  if (k === "Esc") return "Escape";
  if (k === "Del") return "Delete";
  return k.length === 1 ? k.toUpperCase() : k;
}

/** Canonical form: modifiers in fixed order, Mod resolved for the platform. */
export function normalizeChord(chord: KeyChord, mac: boolean): string {
  const parts = chord.split("+").map((p) => p.trim()).filter(Boolean);
  const key = normalizeKey(parts.pop() ?? "");
  const mods = new Set(parts.map((m) => (m === "Mod" ? (mac ? "Meta" : "Ctrl") : m === "Cmd" ? "Meta" : m)));
  return [...MOD_ORDER.filter((m) => mods.has(m)), key].join("+");
}

export function chordFromEvent(e: KeyEventLike): string {
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta"].filter(Boolean);
  return [...mods, normalizeKey(e.key)].join("+");
}

/** Human-readable chord for menus and the shortcut list. */
export function displayChord(chord: KeyChord, mac: boolean): string {
  const c = normalizeChord(chord, mac);
  return mac ? c.replace("Meta+", "⌘").replace("Shift+", "⇧").replace("Alt+", "⌥").replace("Ctrl+", "⌃") : c;
}
