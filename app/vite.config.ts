import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const pkgs = ["units", "dmath", "model", "elements", "engine", "worker", "formats", "history", "render", "app", "xapi", "persistence", "lesson"];

// Same @cs/* aliases as vitest.config.ts, including the elements subpaths.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@cs\/([a-z]+)\/([a-z-]+)$/, replacement: fileURLToPath(new URL("./packages/$1/src/$2.ts", import.meta.url)) },
      ...pkgs.map((p) => ({ find: `@cs/${p}`, replacement: fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url)) })),
    ],
  },
  worker: { format: "es" },
  build: {
    outDir: "../docs/simulator",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      output: {
        // Long-lived vendor chunks (design/index.md §2 goal 4): cached across
        // app releases and across the several embeds on one chapter page.
        manualChunks(id) {
          // Library packages the shell, lessons and analyses all share; they change less often than the app.
          if (/\/packages\/(units|dmath|model|render|history)\/src\//.test(id)) return "cs-core";
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (/node_modules\/(react-aria|react-aria-components|react-stately|@react-aria|@react-stately|@react-types|@internationalized|@swc\/helpers|clsx|use-sync-external-store)\//.test(id))
            return "react-aria";
          return undefined;
        },
      },
    },
  },
});
