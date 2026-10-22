import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const pkgs = ["units", "dmath", "model", "elements", "engine", "worker", "formats", "history", "render", "app", "xapi", "persistence"];

export default defineConfig({
  resolve: {
    alias: [
      // "@cs/elements/models" -> packages/elements/src/models.ts
      { find: /^@cs\/([a-z]+)\/([a-z-]+)$/, replacement: fileURLToPath(new URL("./packages/$1/src/$2.ts", import.meta.url)) },
      ...pkgs.map((p) => ({ find: `@cs/${p}`, replacement: fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url)) })),
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/test/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
  },
});
