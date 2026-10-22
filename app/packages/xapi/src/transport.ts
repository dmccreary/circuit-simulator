import type { Statement, Transport } from "./types";

/** Relay transport (recommended): each statement goes to the host page, which forwards it. */
export function relayTransport(post: (s: Statement) => void): Transport {
  return async (statements) => {
    for (const s of statements) post(s);
  };
}

export interface DirectConfig {
  endpoint: string;
  /** Full Authorization header value, such as "Basic abc=". Only ever from configureXapi (XAP-02). */
  auth?: string;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; keepalive?: boolean }) => Promise<{ ok: boolean; status: number }>;

/** True for https endpoints, or http on a local development host. */
export function isAcceptableEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.username || u.password) return false; // no credentials in URLs (XAP-02)
    return u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname));
  } catch {
    return false;
  }
}

/** Direct transport: POST to `<endpoint>/statements` (xAPI 1.0.3). */
export function directTransport(cfg: DirectConfig, fetchFn?: FetchLike): Transport {
  const f = fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  const url = cfg.endpoint.replace(/\/+$/, "") + "/statements";
  return async (statements: Statement[]) => {
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Experience-API-Version": "1.0.3" };
    if (cfg.auth) headers.Authorization = cfg.auth;
    const res = await f(url, { method: "POST", headers, body: JSON.stringify(statements), keepalive: true });
    if (!res.ok) throw new Error(`LRS responded ${res.status}`);
  };
}
