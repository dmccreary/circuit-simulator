// Runtime half of offline operation (PRF-07): register the service worker in
// production builds, and say when a new version is waiting. Updates never
// interrupt work: the app never reloads itself; the waiting version takes
// over when this page goes away (files-and-persistence.md §6).

import { createStore, type Store } from "../store";

export interface OfflineState {
  /** A new version is installed and waiting. */
  updateReady: boolean;
  dismissed: boolean;
}

export const offlineState: Store<OfflineState> = createStore<OfflineState>({ updateReady: false, dismissed: false });

interface SwRegistration {
  waiting: { postMessage(m: unknown): void } | null;
  installing: { state: string; addEventListener(t: "statechange", fn: () => void): void } | null;
  addEventListener(t: "updatefound", fn: () => void): void;
}
interface SwContainer {
  controller: unknown;
  register(url: string, opts: { scope: string }): Promise<SwRegistration>;
}

export interface RegisterEnv {
  production: boolean;
  serviceWorker?: SwContainer;
  addPageHide?: (fn: () => void) => void;
}

/** Returns false when nothing was registered (development, no service workers). */
export async function registerOffline(env: RegisterEnv): Promise<boolean> {
  const sw = env.serviceWorker;
  if (!env.production || !sw) return false;
  let reg: SwRegistration;
  try {
    reg = await sw.register("./sw.js", { scope: "./" });
  } catch {
    return false; // file:// pages, private modes: the app works online as before
  }
  const ready = () => offlineState.set({ updateReady: true });
  // An update found while a version already controls this page waits for a convenient moment.
  if (reg.waiting && sw.controller) ready();
  reg.addEventListener("updatefound", () => {
    const next = reg.installing;
    next?.addEventListener("statechange", () => {
      if (next.state === "installed" && sw.controller) ready();
    });
  });
  // Leaving the page is the convenient moment: the next load gets the new version.
  env.addPageHide?.(() => reg.waiting?.postMessage({ type: "skip-waiting" }));
  return true;
}

/** Browser wiring; called once from main.tsx. */
export function startOffline(): void {
  if (typeof window === "undefined") return;
  void registerOffline({
    production: import.meta.env.PROD,
    serviceWorker: (navigator as unknown as { serviceWorker?: SwContainer }).serviceWorker,
    addPageHide: (fn) => window.addEventListener("pagehide", fn),
  });
}

/** "Reload" in the notice: let the waiting version take over, then reload once. */
export async function applyUpdate(): Promise<void> {
  const sw = (navigator as unknown as { serviceWorker?: { getRegistration(): Promise<SwRegistration | undefined>; addEventListener(t: string, fn: () => void): void } }).serviceWorker;
  const reg = await sw?.getRegistration().catch(() => undefined);
  if (reg?.waiting && sw) {
    sw.addEventListener("controllerchange", () => location.reload());
    reg.waiting.postMessage({ type: "skip-waiting" });
    setTimeout(() => location.reload(), 3000); // in case the change event never comes
  } else location.reload();
}
