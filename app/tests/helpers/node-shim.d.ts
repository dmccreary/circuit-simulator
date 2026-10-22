// Node built-ins used by the acceptance and story tests beyond those in
// tests/library/node-shim.d.ts (the app has no @types/node). Ambient module
// declarations merge with that file's.
declare module "node:fs" {
  export function writeFileSync(path: string, data: string): void;
}
