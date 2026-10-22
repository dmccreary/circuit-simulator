// Minimal declarations for the Node built-ins the library test uses
// (the app has no @types/node; vitest runs the test under Node).
declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: "utf8"): string;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
}
declare module "node:url" {
  export function fileURLToPath(url: URL | string): string;
}
declare const process: { env: Record<string, string | undefined> };
