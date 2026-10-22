import type { MessageRef } from "@cs/model";
import { lookup, addEnglish } from "./i18n";

// UI text is never hard-coded in components (Overview §7.2); strings live in i18n/*.json.

export function t(m: MessageRef | string): string {
  const ref = typeof m === "string" ? { key: m } : m;
  let s = lookup(ref.key) ?? fallback(ref);
  for (const [k, v] of Object.entries(ref.values ?? {})) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Parts without a written description read as "R1, resistor" (ACC-07). */
function fallback(ref: MessageRef): string {
  const m = /^element\.(.+)\.describe$/.exec(ref.key);
  if (!m) return ref.key;
  const name = m[1].replace(/-/g, " ");
  return ref.values?.label ? `${ref.values.label}, ${name}` : name;
}

/** Feature modules register their own English strings (existing keys win). */
export function addMessages(m: Record<string, string>): void {
  addEnglish(m);
}

/** "internalResistance" -> "Internal resistance" for props without a message yet. */
export function propLabel(key: string): string {
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
