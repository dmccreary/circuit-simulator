import { precacheList, serviceWorkerSource, versionOf, offlinePlugin } from "../src/offline/sw-build";
import { offlineState, registerOffline } from "../src/offline/register";

describe("offline service worker (PRF-07)", () => {
  test("the precache list holds the app shell, not maps, examples or the worker itself", () => {
    const list = precacheList([
      "index.html",
      "assets/index-abc.js",
      "assets/index-abc.js.map",
      "assets/index-def.css",
      "assets/live-worker-x.js",
      "circuits/lrc.txt",
      "circuits/index.json",
      "lessons/ohms-law.yaml",
      "sw.js",
    ]);
    expect(list).toEqual(["./", "./assets/index-abc.js", "./assets/index-def.css", "./assets/live-worker-x.js", "./index.html", "./circuits/index.json"]);
  });

  test("the version changes with the content", () => {
    expect(versionOf(["a"])).toBe(versionOf(["a"]));
    expect(versionOf(["a"])).not.toBe(versionOf(["b"]));
  });

  test("the generated worker is valid JavaScript with versioned caches", () => {
    const src = serviceWorkerSource("v1", ["./", "./index.html"]);
    expect(src).toContain('const SHELL = "cs-shell-" + VERSION;');
    expect(src).toContain('const PRECACHE = ["./","./index.html"];');
    expect(src).not.toMatch(/skipWaiting\(\)\s*;\s*\n\s*event\.waitUntil/);
    // Parses as a script.
    expect(() => new Function(src.replace(/self\.registration\.scope/g, '"https://x/"').replace(/^"use strict";/m, ""))).not.toThrow();
  });

  test("the Vite plugin emits sw.js from the bundle", () => {
    const emitted: { fileName: string; source: string }[] = [];
    const plugin = offlinePlugin();
    plugin.generateBundle.call(
      { emitFile: (f) => void emitted.push(f) },
      {},
      {
        "index.html": { type: "asset", fileName: "index.html", source: "<html>" },
        "assets/a.js": { type: "chunk", fileName: "assets/a.js", code: "x" },
      },
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0].fileName).toBe("sw.js");
    expect(emitted[0].source).toContain('"./assets/a.js"');
  });

  test("registration happens only in production, and a waiting update is announced", async () => {
    expect(await registerOffline({ production: false, serviceWorker: undefined })).toBe(false);
    const calls: string[] = [];
    let hide: (() => void) | undefined;
    const posted: unknown[] = [];
    const reg = {
      waiting: { postMessage: (m: unknown) => void posted.push(m) },
      installing: null,
      addEventListener: () => undefined,
    };
    const ok = await registerOffline({
      production: true,
      serviceWorker: { controller: {}, register: async (url, o) => (calls.push(`${url} ${o.scope}`), reg) },
      addPageHide: (fn) => (hide = fn),
    });
    expect(ok).toBe(true);
    expect(calls).toEqual(["./sw.js ./"]);
    expect(offlineState.get().updateReady).toBe(true);
    hide?.();
    expect(posted).toEqual([{ type: "skip-waiting" }]);
  });
});
