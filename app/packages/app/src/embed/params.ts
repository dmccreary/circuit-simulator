import { parseValue } from "@cs/units";

export type EmbedMode = "edit" | "run" | "view" | "lesson";
export type PanelId = "palette" | "chart" | "inspector" | "status" | "topbar";
export type LayoutId = "auto" | "side" | "stacked" | "circuit" | "chart";

export const ALL_PANELS: PanelId[] = ["palette", "chart", "inspector", "status", "topbar"];

/** Spec Section 19.1, parsed and validated (EMB-01). */
export interface EmbedConfig {
  /** Running inside another page's iframe. */
  embedded: boolean;
  mode: EmbedMode;
  circuit?: string;
  example?: string;
  ctz?: string;
  c?: string;
  lesson?: string;
  /** Undefined means all panels. */
  panels?: PanelId[];
  layout: LayoutId;
  /** Parsed, but SIM-01a (load paused, always) takes precedence. */
  autorun: boolean;
  /** Chart window in seconds. */
  window?: number;
  /** Speed setting 1..100. */
  speed?: number;
  current?: "conventional" | "electron" | "off";
  realistic?: boolean;
  theme: "auto" | "light" | "dark";
  symbols?: "ansi" | "iec";
  lock: string[] | "all";
  id: string;
  xapi: boolean;
  lang?: string;
  /** Preferred height in CSS px (extension: the host helper's data-height). */
  height?: number;
  /** Extra host origins trusted by the bridge, besides the simulator's own (EMB-12). */
  allow: string[];
  warnings: string[];
}

const oneOf = <T extends string>(v: string, list: readonly T[]): T | undefined => (list as readonly string[]).includes(v) ? (v as T) : undefined;

/** Short stable hash, so a generated embed id stays the same for the same URL (XAP-07). */
export function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/**
 * Read embed parameters from a query string (and fragment, for `#c=` share
 * links). Unknown parameters are ignored; invalid values fall back to their
 * default and add a warning (EMB-01).
 */
export function parseEmbedParams(search: string, hash = "", embedded = false): EmbedConfig {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const warnings: string[] = [];
  const bad = (name: string, value: string) => warnings.push(`Ignored ${name}=${value}: not a valid value.`);
  const get = (name: string) => {
    const v = q.get(name);
    return v === null ? undefined : v.trim();
  };
  const enumParam = <T extends string>(name: string, list: readonly T[]): T | undefined => {
    const v = get(name);
    if (v === undefined || v === "") return undefined;
    const r = oneOf(v, list);
    if (!r) bad(name, v);
    return r;
  };
  const flag = (name: string): boolean | undefined => {
    const v = get(name);
    if (v === undefined || v === "") return undefined;
    if (v === "1" || v === "0") return v === "1";
    bad(name, v);
    return undefined;
  };

  const lesson = get("lesson") || undefined;
  let mode = enumParam("mode", ["edit", "run", "view", "lesson"] as const) ?? (lesson ? "lesson" : "edit");
  if (mode === "lesson" && !lesson) {
    warnings.push("mode=lesson needs a lesson parameter; showing the circuit in run mode.");
    mode = "run";
  }

  let panels: PanelId[] | undefined;
  const pv = get("panels");
  if (pv !== undefined) {
    const items = pv.split(",").map((s) => s.trim()).filter(Boolean);
    const valid = items.filter((p): p is PanelId => !!oneOf(p, ALL_PANELS));
    items.filter((p) => !oneOf(p, ALL_PANELS)).forEach((p) => bad("panels", p));
    panels = valid;
  }

  let window: number | undefined;
  const wv = get("window");
  if (wv) {
    const s = parseValue(wv, "s");
    if (s !== null && s > 0) window = s;
    else bad("window", wv);
  }

  let speed: number | undefined;
  const sv = get("speed");
  if (sv) {
    const n = Number(sv);
    if (Number.isFinite(n) && n >= 1 && n <= 100) speed = n;
    else bad("speed", sv);
  }

  let height: number | undefined;
  const hv = get("height");
  if (hv) {
    const n = parseInt(hv, 10);
    if (Number.isFinite(n) && n >= 120 && n <= 4000) height = n;
    else bad("height", hv);
  }

  const lv = get("lock");
  const lock: string[] | "all" = lv === "all" ? "all" : lv ? lv.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const allow: string[] = [];
  for (const o of (get("allow") ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      const u = new URL(o);
      if (u.protocol === "https:" || u.protocol === "http:") allow.push(u.origin);
      else bad("allow", o);
    } catch {
      bad("allow", o);
    }
  }

  let id = get("id");
  if (id !== undefined && !/^[A-Za-z0-9._:-]{1,64}$/.test(id)) {
    bad("id", id);
    id = undefined;
  }

  let example = get("example") || undefined;
  if (example && (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(example) || example.split("/").includes(".."))) {
    bad("example", example);
    example = undefined;
  }

  const fragC = /(?:^#|&)c=([^&]+)/.exec(hash)?.[1];
  const autorun = flag("autorun") ?? true;
  const xapiRaw = get("xapi");
  const cfg: EmbedConfig = {
    embedded,
    mode,
    circuit: get("circuit") || undefined,
    example,
    ctz: rawParam(search, "ctz"),
    c: get("c") || fragC || undefined,
    lesson,
    panels,
    layout: enumParam("layout", ["auto", "side", "stacked", "circuit", "chart"] as const) ?? "auto",
    autorun,
    window,
    speed,
    current: enumParam("current", ["conventional", "electron", "off"] as const),
    realistic: flag("realistic"),
    theme: enumParam("theme", ["auto", "light", "dark"] as const) ?? "auto",
    symbols: enumParam("symbols", ["ansi", "iec"] as const),
    lock,
    id: id ?? `embed-${stableHash(withoutParam(search, "id"))}`,
    // Accepts 1/0; other values (such as the book's "?xapi=teaching") also mean "allowed".
    xapi: xapiRaw !== undefined && xapiRaw !== "" && xapiRaw !== "0",
    lang: get("lang") || undefined,
    height,
    allow,
    warnings,
  };
  return cfg;
}

/** lz-string uses "+", which URLSearchParams would turn into a space. */
function rawParam(search: string, name: string): string | undefined {
  const m = new RegExp(`(?:^\\??|&)${name}=([^&#]*)`).exec(search);
  return m?.[1] || undefined;
}

function withoutParam(search: string, name: string): string {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  q.delete(name);
  q.sort();
  return q.toString();
}

/** Map the 1..100 `speed` setting to simulated seconds per real second (1 µs/s .. 10×). */
export function speedFromSetting(s: number): number {
  const exp = -6 + ((s - 1) / 99) * 7;
  return Number((10 ** exp).toPrecision(2));
}
