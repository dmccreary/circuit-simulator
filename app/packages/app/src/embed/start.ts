import { XapiReporter, webStorage } from "@cs/xapi";
import { decodeShareLink } from "@cs/formats";
import type { AppController } from "../controller";
import { addMessages } from "../messages";
import { filesOf } from "../files";
import { HostBridge, windowBridgeEnv, type BridgeHooks } from "./bridge";
import { EmbedRuntime } from "./runtime";
import { attachXapi } from "./xapi-hook";
import { parseEmbedParams, speedFromSetting, type EmbedConfig } from "./params";

addMessages({
  "embed.resetOriginal": "Reset to original",
  "embed.openFull": "Open in full simulator",
  "embed.recording": "Activity recording on",
});

export interface EmbedSession {
  config: EmbedConfig;
  runtime: EmbedRuntime;
  bridge: HostBridge;
  reporter: XapiReporter;
  dispose(): void;
}

/** Read the embed parameters from the page address (before the controller exists, for the theme). */
export function readEmbedConfig(win: Window): EmbedConfig {
  return parseEmbedParams(win.location.search, win.location.hash, win.parent !== win);
}

/** Whether the simulator should start dark (EMB-09: `theme=auto` follows the reader's preference). */
export function prefersDark(cfg: EmbedConfig, win: Window): boolean {
  if (cfg.theme !== "auto") return cfg.theme === "dark";
  return typeof win.matchMedia === "function" && win.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Host loadCircuit through the file layer, so loading works the same as File > Open. */
function hostLoader(c: AppController): BridgeHooks["loadCircuit"] {
  return async (p) => {
    const files = filesOf(c);
    if (typeof p.text === "string") return files.openText(p.text, typeof p.name === "string" ? p.name : undefined, undefined, { force: true });
    if (typeof p.example === "string") return files.openExample(p.example, { force: true });
    if (typeof p.c === "string") return files.openDocument(await decodeShareLink(p.c), { force: true });
    if (typeof p.url === "string") {
      const req = await files.openFromUrl(`?circuit=${encodeURIComponent(p.url)}`);
      return !!req;
    }
    return false;
  };
}

/**
 * Embed start-up (embedding-lessons-xapi.md §2.1): capability set, host
 * bridge, and the xAPI reporter. The circuit named by the URL is opened by
 * the file layer; the bridge posts `ready` once it has loaded.
 */
export function startEmbed(c: AppController, cfg: EmbedConfig, win: Window): EmbedSession {
  if (cfg.speed !== undefined) c.setSpeed(speedFromSetting(cfg.speed));
  const runtime = new EmbedRuntime(c, cfg, { href: win.location.href });

  let bridge: HostBridge | undefined;
  const page = cfg.embedded && win.document.referrer ? win.document.referrer : win.location.href;
  const reporter = new XapiReporter({
    allowed: cfg.xapi,
    context: { page, embedId: cfg.id, circuitId: runtime.sourceId, circuitName: c.edits.doc.meta.title, mode: cfg.mode },
    relay: (statement) => bridge?.post("xapiStatement", { statement }),
    storage: webStorage(`cs.xapiQueue.${cfg.id}`),
  });
  reporter.onChange((on) => runtime.state.set({ recording: on }));

  bridge = new HostBridge(runtime, windowBridgeEnv(win, cfg.allow), {
    configureXapi: (p) => reporter.configure(p),
    loadCircuit: hostLoader(c),
  });

  const offXapi = attachXapi(runtime, reporter, {
    onLeave: (fn) => {
      win.addEventListener("pagehide", fn);
      return () => win.removeEventListener("pagehide", fn);
    },
  });

  // `ready` after the URL's circuit has loaded (or at once when it names none).
  const b = bridge;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let offLoad: (() => void) | undefined;
  const ready = () => {
    offLoad?.();
    offLoad = undefined;
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = undefined;
    b.ready();
  };
  if (runtime.sourceId === "default") readyTimer = setTimeout(ready, 0);
  else {
    offLoad = runtime.onChange((ch) => ch.source === "load" && ready());
    readyTimer = setTimeout(ready, 5000);
  }

  const resize = () => b.postHeight();
  win.addEventListener("resize", resize);

  return {
    config: cfg,
    runtime,
    bridge: b,
    reporter,
    dispose() {
      offLoad?.();
      if (readyTimer) clearTimeout(readyTimer);
      win.removeEventListener("resize", resize);
      offXapi();
      b.dispose();
      reporter.dispose();
      runtime.dispose();
    },
  };
}
