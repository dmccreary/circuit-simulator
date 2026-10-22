import type { ThemeName } from "@cs/render";

/**
 * Learner settings (SET-01): a small versioned object in localStorage, read
 * synchronously at startup and never written into circuit files (SET-04).
 */
export interface LearnerSettings {
  version: 1;
  theme: "auto" | ThemeName;
  symbolStyle: "ansi" | "iec" | "lifelike";
  currentDisplay: "conventional" | "electron" | "off";
  voltageColors: "red-green" | "blue-orange" | "off";
  decimalSeparator: "." | ",";
  reducedMotion: "auto" | "on" | "off";
  /** Command id -> chords, for commands whose keys the learner changed (SET-06). */
  keymap: Record<string, string[]>;
  /** Splitter positions and the chosen view (LAY-11). */
  layout: { chartFrac?: number; paletteW?: number; inspectorW?: number; view?: "both" | "circuit" | "chart" };
}

export const LEARNER_KEY = "circuit-simulator.learner-settings";

export const DEFAULT_LEARNER: LearnerSettings = {
  version: 1,
  theme: "auto",
  symbolStyle: "ansi",
  currentDisplay: "conventional",
  voltageColors: "red-green",
  decimalSeparator: ".",
  reducedMotion: "auto",
  keymap: {},
  layout: {},
};

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
const num = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;

/** Keep what is valid, default the rest; unknown versions start over. */
export function sanitizeLearner(raw: unknown): LearnerSettings {
  const d = DEFAULT_LEARNER;
  if (!raw || typeof raw !== "object") return { ...d, keymap: {}, layout: {} };
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return { ...d, keymap: {}, layout: {} };
  const keymap: Record<string, string[]> = {};
  if (r.keymap && typeof r.keymap === "object") {
    for (const [id, keys] of Object.entries(r.keymap as Record<string, unknown>)) {
      if (Array.isArray(keys)) keymap[id] = keys.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length < 40);
    }
  }
  const l = (r.layout && typeof r.layout === "object" ? r.layout : {}) as Record<string, unknown>;
  const layout: LearnerSettings["layout"] = {};
  const chartFrac = num(l.chartFrac, 0.1, 0.9);
  const paletteW = num(l.paletteW, 80, 600);
  const inspectorW = num(l.inspectorW, 120, 700);
  if (chartFrac !== undefined) layout.chartFrac = chartFrac;
  if (paletteW !== undefined) layout.paletteW = paletteW;
  if (inspectorW !== undefined) layout.inspectorW = inspectorW;
  if (l.view === "both" || l.view === "circuit" || l.view === "chart") layout.view = l.view;
  return {
    version: 1,
    theme: pick(r.theme, ["auto", "light", "dark", "high-contrast"] as const, d.theme),
    symbolStyle: pick(r.symbolStyle, ["ansi", "iec", "lifelike"] as const, d.symbolStyle),
    currentDisplay: pick(r.currentDisplay, ["conventional", "electron", "off"] as const, d.currentDisplay),
    voltageColors: pick(r.voltageColors, ["red-green", "blue-orange", "off"] as const, d.voltageColors),
    decimalSeparator: pick(r.decimalSeparator, [".", ","] as const, d.decimalSeparator),
    reducedMotion: pick(r.reducedMotion, ["auto", "on", "off"] as const, d.reducedMotion),
    keymap,
    layout,
  };
}

export function loadLearner(storage: StorageLike | undefined): LearnerSettings {
  try {
    const text = storage?.getItem(LEARNER_KEY);
    return sanitizeLearner(text ? JSON.parse(text) : undefined);
  } catch {
    return sanitizeLearner(undefined);
  }
}

export function saveLearner(storage: StorageLike | undefined, s: LearnerSettings): boolean {
  try {
    storage?.setItem(LEARNER_KEY, JSON.stringify(s));
    return !!storage;
  } catch {
    return false; // private mode or quota: settings last for this session only
  }
}

/** The browser's localStorage, or undefined where it is missing or blocked. */
export function browserStorage(): StorageLike | undefined {
  try {
    // Through window: Node's own global localStorage warns when touched outside a browser.
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

const media = (q: string): boolean => typeof matchMedia === "function" && matchMedia(q).matches;

export function systemPrefersReducedMotion(): boolean {
  return media("(prefers-reduced-motion: reduce)");
}

export function resolveReducedMotion(s: LearnerSettings, system = systemPrefersReducedMotion()): boolean {
  return s.reducedMotion === "auto" ? system : s.reducedMotion === "on";
}
