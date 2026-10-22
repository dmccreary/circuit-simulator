// Share links (files-and-persistence.md §3, FIL-05..07): the compact native
// JSON, deflate-raw compressed, base64url encoded, carried as `#c=...`.

import type { CircuitDocument } from "@cs/model";
import { FormatError } from "../document";
import { parseCircuit, serializeCircuitCompact } from "../native/circuitFile";
import { base64urlDecode, base64urlEncode } from "./base64url";

/** FIL-06: many chat and email tools truncate links longer than this. */
export const SHARE_LINK_WARN_LENGTH = 8000;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Returns the payload only (no `#c=`); use `shareLinkFragment` to build the fragment. */
export async function encodeShareLink(doc: CircuitDocument): Promise<string> {
  const json = new TextEncoder().encode(serializeCircuitCompact(doc));
  return base64urlEncode(await pipe(json, new CompressionStream("deflate-raw")));
}

export const shareLinkFragment = (payload: string): string => `#c=${payload}`;

/** True when a full link (base URL plus fragment) would pass the FIL-06 warning length. */
export function isShareLinkTooLong(payload: string, baseUrlLength = 0): boolean {
  return baseUrlLength + 3 + payload.length > SHARE_LINK_WARN_LENGTH;
}

/**
 * Accepts the bare payload, `#c=...`, `?c=...`, `c=...`, or a whole URL with
 * the circuit in either the fragment or the `c` query parameter.
 */
export async function decodeShareLink(fragmentOrParam: string): Promise<CircuitDocument> {
  const payload = extractPayload(fragmentOrParam.trim());
  let bytes: Uint8Array;
  try {
    bytes = await pipe(base64urlDecode(payload), new DecompressionStream("deflate-raw"));
  } catch {
    throw new FormatError({ key: "share.corrupt" });
  }
  return parseCircuit(new TextDecoder().decode(bytes)).doc;
}

function extractPayload(s: string): string {
  const hash = s.indexOf("#");
  const query = s.indexOf("?");
  for (const part of [hash >= 0 ? s.slice(hash + 1) : null, query >= 0 ? s.slice(query + 1).split("#")[0] : null]) {
    if (part === null) continue;
    const c = new URLSearchParams(part).get("c");
    if (c) return c;
  }
  if (s.startsWith("c=")) return s.slice(2);
  return s;
}
