// FIL-03: each released format change ships a migration from the previous
// version. Opening a file runs the chain up to CURRENT_FORMAT_VERSION.

import type { MessageRef } from "@cs/model";

export type RawFile = Record<string, unknown> & { formatVersion: number };

export interface Migration {
  from: number;
  to: number; // always from + 1
  migrate(file: RawFile): RawFile;
}

/** Empty while version 1 is the only version. Add `{ from: 1, to: 2, migrate }` here. */
export const MIGRATIONS: readonly Migration[] = [];

export function runMigrations(
  file: RawFile,
  target: number,
  migrations: readonly Migration[] = MIGRATIONS,
): { file: RawFile; notices: MessageRef[] } {
  const notices: MessageRef[] = [];
  const start = file.formatVersion;
  let cur = file;
  while (cur.formatVersion < target) {
    const m = migrations.find((x) => x.from === cur.formatVersion);
    if (!m) {
      notices.push({ key: "file.noMigration", values: { from: cur.formatVersion, to: target } });
      break;
    }
    cur = { ...m.migrate(cur), formatVersion: m.to };
  }
  if (cur.formatVersion !== start && cur.formatVersion === target) {
    notices.push({ key: "file.migrated", values: { from: start, to: target } });
  }
  return { file: cur, notices };
}
