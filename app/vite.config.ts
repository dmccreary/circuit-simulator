import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const pkgs = ["units", "dmath", "model", "elements", "engine", "worker", "formats", "history", "render", "app", "xapi", "persistence"];

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
  },
});
