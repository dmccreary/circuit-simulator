// Native `.circuit.json` reader and writer (files-and-persistence.md §2, FIL-01..03).

import type { CircuitDocument, MessageRef } from "@cs/model";
import { CURRENT_FORMAT_VERSION, FormatError } from "../document";
import { documentFromFile, documentToFile, FORMAT_NAME, UNKNOWN_PLACEHOLDER, type CircuitFileV1 } from "./fileShape";
import { writeTopLevel } from "./jsonText";
import { MIGRATIONS, runMigrations, type Migration, type RawFile } from "./migrations";

export interface SerializeOptions {
  /** Part label -> node names, from the netlist compiler. Written for readers only. */
  netlistSummary?: Record<string, string[]>;
}

const EXPANDED = new Set(["netlist"]);

export function serializeCircuit(doc: CircuitDocument, opts: SerializeOptions = {}): string {
  const file: CircuitFileV1 = documentToFile(doc);
  // Always write the current version: the document is in the current shape once loaded.
  file.formatVersion = CURRENT_FORMAT_VERSION;
  if (opts.netlistSummary && Object.keys(opts.netlistSummary).length) {
    file.netlist = { _note: "Written for readers only and ignored when the file is opened.", ...opts.netlistSummary };
  }
  return writeTopLevel(file as unknown as Record<string, unknown>, EXPANDED);
}

/** Compact single-line form used inside share links. */
export function serializeCircuitCompact(doc: CircuitDocument): string {
  const file = documentToFile(doc);
  file.formatVersion = CURRENT_FORMAT_VERSION;
  return JSON.stringify(file);
}

export interface ParseOptions {
  /** Part types this build can simulate; others become placeholders that keep their raw data. */
  isKnownType?: (type: string) => boolean;
  /** For tests of the migration chain. */
  migrations?: readonly Migration[];
}

export function parseCircuit(text: string, opts: ParseOptions = {}): { doc: CircuitDocument; notices: MessageRef[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new FormatError({ key: "file.notJson" });
  }
  return parseCircuitObject(raw, opts);
}

export function parseCircuitObject(raw: unknown, opts: ParseOptions = {}): { doc: CircuitDocument; notices: MessageRef[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new FormatError({ key: "file.notCircuit" });
  const obj = raw as Record<string, unknown>;
  if (obj.format !== FORMAT_NAME) throw new FormatError({ key: "file.notCircuit" });
  if (typeof obj.formatVersion !== "number" || !Number.isInteger(obj.formatVersion) || obj.formatVersion < 1) {
    throw new FormatError({ key: "file.badVersion" });
  }
  if (!Array.isArray(obj.parts ?? []) || !Array.isArray(obj.wires ?? [])) throw new FormatError({ key: "file.notCircuit" });

  const notices: MessageRef[] = [];
  let file = obj as RawFile;
  if (file.formatVersion > CURRENT_FORMAT_VERSION) {
    // FIL-03 forward: open as far as possible.
    notices.push({ key: "file.newerVersion", values: { version: file.formatVersion, current: CURRENT_FORMAT_VERSION } });
  } else {
    const m = runMigrations(file, CURRENT_FORMAT_VERSION, opts.migrations ?? MIGRATIONS);
    file = m.file;
    notices.push(...m.notices);
  }

  const doc = documentFromFile(file as unknown as CircuitFileV1, opts.isKnownType);
  doc.formatVersion = CURRENT_FORMAT_VERSION;
  const unknown = Object.values(doc.parts).filter((p) => p.type === UNKNOWN_PLACEHOLDER);
  if (unknown.length) {
    const types = [...new Set(unknown.map((p) => String(p.props.originalType)))].join(", ");
    notices.push({ key: "file.unknownParts", values: { count: unknown.length, types } });
  }
  return { doc, notices };
}
