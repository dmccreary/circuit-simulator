// Turns the contents of any supported circuit file into a document plus the
// notices the student should see (FIL-03 forward notices, FIL-16 import report).

import type { CircuitDocument, MessageRef } from "@cs/model";
import { FormatError, importFalstad, parseCircuit, type FalstadImportReport } from "@cs/formats";
import { baseName } from "./base-name";

export interface ReadResult {
  doc: CircuitDocument;
  /** "native" files are ours; anything else was converted. */
  format: "native" | "falstad";
  notices: MessageRef[];
  report?: FalstadImportReport;
}

/** File name without the circuit extensions (re-exported; lives in base-name.ts so the shell need not load this module). */
export { baseName };

export function readCircuitText(text: string, opts: { name?: string; isKnownType?: (t: string) => boolean } = {}): ReadResult {
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (!trimmed) throw new FormatError({ key: "file.empty" });
  if (trimmed.startsWith("{")) {
    const { doc, notices } = parseCircuit(trimmed, { isKnownType: opts.isKnownType });
    if (!doc.meta.title && opts.name) doc.meta.title = baseName(opts.name);
    return { doc, format: "native", notices };
  }
  // Falstad's text and XML (<cir ...>) formats both go through importFalstad (FIL-14).
  const { doc, report } = importFalstad(trimmed);
  if (!doc.meta.title && opts.name) doc.meta.title = baseName(opts.name);
  const notices: MessageRef[] = [];
  if (report.unsupported.length) {
    const codes = [...new Set(report.unsupported.map((u) => u.code))].join(", ");
    notices.push({ key: "falstad.unsupported", values: { count: report.unsupported.length, codes } });
  }
  if (report.ignored.length) notices.push({ key: "falstad.ignored", values: { count: report.ignored.length } });
  notices.push(...report.warnings.filter((w) => !QUIET_WARNINGS.has(w.message.key)).map((w) => w.message));
  if (!Object.keys(doc.parts).length && !Object.keys(doc.wires).length && !report.unsupported.length) {
    throw new FormatError({ key: "file.notCircuit" });
  }
  return { doc, format: "falstad", notices, report };
}

/**
 * Geometry adjustments the importer already handled exactly; they stay in the
 * report but are not worth a dialog every time a student opens an example.
 */
const QUIET_WARNINGS = new Set(["falstad.lengthChanged", "falstad.offGrid", "falstad.diagonal", "falstad.lineSkipped"]);
