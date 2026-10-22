// What the page address asks the simulator to open at startup
// (files-and-persistence.md §3, spec §19.1, FIL-07, FIL-15, FIL-19).

import { readFalstadLink } from "@cs/formats";

export type StartupRequest =
  | { kind: "share"; payload: string }
  | { kind: "example"; file: string }
  | { kind: "falstad"; text: string }
  | { kind: "url"; url: string };

/** Library file names are plain names such as `lrc.txt`: no paths, no schemes. */
export const isExampleFileName = (f: string): boolean => /^[\w][\w.+-]*\.txt$/.test(f) && !f.includes("..");

function rawParams(s: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const pair of s.split("&")) {
    const eq = pair.indexOf("=");
    if (eq > 0) m.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return m;
}

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
};

/**
 * Reads a full page address. Precedence: native share link (`#c=`, then `?c=`),
 * `?example=`, Falstad `ctz` / `cct` / `startCircuit`, then `?circuit=<url>`.
 * Returns null when the address names no circuit.
 */
export function parseStartupUrl(href: string): StartupRequest | null {
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt + 1) : "";
  const beforeHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const query = beforeHash.includes("?") ? beforeHash.slice(beforeHash.indexOf("?") + 1) : "";
  const q = rawParams(query);
  const h = rawParams(hash);

  const c = h.get("c") ?? q.get("c");
  if (c) return { kind: "share", payload: c };

  const example = q.get("example");
  if (example !== undefined) {
    const file = decode(example);
    if (isExampleFileName(file)) return { kind: "example", file };
  }

  if (q.has("ctz") || q.has("cct") || q.has("startCircuit")) {
    const f = readFalstadLink(query);
    if (f?.kind === "text") return { kind: "falstad", text: f.text };
    if (f?.kind === "example" && isExampleFileName(f.file)) return { kind: "example", file: f.file };
  }

  const circuit = q.get("circuit");
  if (circuit) {
    const url = decode(circuit);
    if (/^(https?:|\.{0,2}\/|[\w-])/.test(url) && !/^(javascript|data):/i.test(url)) return { kind: "url", url };
  }
  return null;
}

/** True when the text is a Falstad link rather than a circuit (Import → Falstad link). */
export const looksLikeFalstadLink = (s: string): boolean => /[?&](ctz|cct|startCircuit)=/.test(s);
