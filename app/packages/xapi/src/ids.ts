/** The page address without query or fragment (XAP-07). */
export function pageAddress(url: string): string {
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

const seg = (s: string) => encodeURIComponent(s.trim() || "_");

/**
 * Stable activity identifier: the same circuit (or lesson) in the same embed on
 * the same page always yields the same IRI, so many learners' results combine
 * (XAP-07). Sub-objects (a part, a property, a probe) extend the path.
 */
export function activityId(page: string, embedId: string, circuitId: string, ...sub: string[]): string {
  const base = `${pageAddress(page)}#circuit-simulator/${seg(embedId)}/${seg(circuitId)}`;
  return sub.length ? `${base}/${sub.map(seg).join("/")}` : base;
}

/** RFC 4122 v4 identifier; uses crypto.randomUUID where available. */
export function uuid(rand: () => number = Math.random): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (rand === Math.random && c?.randomUUID) return c.randomUUID();
  const hex = [...Array(32)].map(() => Math.floor(rand() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** ISO 8601 duration with seconds only ("PT12.5S"). */
export function isoDuration(ms: number): string {
  return `PT${Math.max(0, Math.round(ms / 100) / 10)}S`;
}
