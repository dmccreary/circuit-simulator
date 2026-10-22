// Falstad link parameters, as read by CirSim.java:
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/CirSim.java
//   ctz=<lz-string>  compressed circuit text
//   cct=<text>       circuit text, URL-encoded
//   startCircuit=<file name in the example library>

import { decompressLz } from "./lz";

export type FalstadLinkContent = { kind: "text"; text: string } | { kind: "example"; file: string } | null;

export function readFalstadLink(urlOrQuery: string): FalstadLinkContent {
  const q = urlOrQuery.includes("?") ? urlOrQuery.slice(urlOrQuery.indexOf("?") + 1) : urlOrQuery;
  // Read raw values: URLSearchParams would turn the "+" of lz-string into spaces.
  const params = new Map<string, string>();
  for (const pair of q.split(/[&#]/)) {
    const eq = pair.indexOf("=");
    if (eq > 0) params.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  const ctz = params.get("ctz");
  if (ctz) {
    const text = decompressLz(ctz);
    return text ? { kind: "text", text } : null;
  }
  const cct = params.get("cct");
  if (cct) return { kind: "text", text: decodeURIComponent(cct.replace(/\+/g, " ")) };
  const start = params.get("startCircuit");
  if (start) return { kind: "example", file: decodeURIComponent(start) };
  return null;
}
