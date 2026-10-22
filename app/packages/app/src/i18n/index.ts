import en from "./en.json";

/** English strings: the shipped file plus what feature modules register with addMessages(). */
const EN: Record<string, string> = { ...(en as Record<string, string>) };
let active: { code: string; messages: Record<string, string> } = { code: "en", messages: {} };
const listeners = new Set<() => void>();

/** The active locale's string, falling back to English. */
export function lookup(key: string): string | undefined {
  return active.messages[key] ?? EN[key];
}

/** Register English strings; existing keys win so a module cannot override the shipped text. */
export function addEnglish(m: Record<string, string>): void {
  for (const [k, v] of Object.entries(m)) if (!(k in EN)) EN[k] = v;
}

export function englishKeys(): string[] {
  return Object.keys(EN);
}

export function currentLocale(): string {
  return active.code;
}

/** Use a locale's strings; keys it lacks stay English. "en" clears the overlay. */
export function setLocale(code: string, messages: Record<string, string> = {}): void {
  active = { code, messages: code === "en" ? {} : { ...messages } };
  for (const l of [...listeners]) l();
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type LocaleLoader = (code: string) => Promise<Record<string, string>>;

/** Fetch `locales/<code>.json` next to the page; hosts may pass their own loader. */
export const fetchLocale: LocaleLoader = async (code) => {
  const res = await fetch(new URL(`locales/${encodeURIComponent(code)}.json`, document.baseURI));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as unknown;
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("not a message file");
  return Object.fromEntries(Object.entries(json as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>;
};

/** Load and activate a locale. On failure the interface stays in the current language. */
export async function loadLocale(code: string, load: LocaleLoader = fetchLocale): Promise<boolean> {
  if (code === "en" || code.startsWith("en-")) {
    setLocale("en");
    return true;
  }
  try {
    setLocale(code, await load(code));
    return true;
  } catch {
    return false;
  }
}
