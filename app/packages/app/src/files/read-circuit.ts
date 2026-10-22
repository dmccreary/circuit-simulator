// Turns the contents of any supported circuit file into a document plus the
// notices the student should see (FIL-03 forward notices, FIL-16 import report).

import type { CircuitDocument, MessageRef } from "@cs/model";
import { FormatError, importFalstad, parseCircuit, type FalstadImportReport } from "@cs/formats";

export interface ReadResult {
  doc: CircuitDocument;
  /** "native" files are ours; anything else was converted. */
  format: "native" | "falstad";
  notices: MessageRef[];
  report?: FalstadImportReport;
}

/** File name without the circuit extensions: "rc.circuit.json" -> "rc". */
export const baseName = (name: string): string => name.replace(/\.(circuit\.json|json|txt)$/i, "");

export function readCircuitText(text: string, opts: { name?: string; isKnownType?: (t: string) => boolean } = {}): ReadResult {
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (!trimmed) throw new FormatError({ key: "file.empty" });
  if (trimmed.startsWith("{")) {
    const { doc, notices } = parseCircuit(trimmed, { isKnownType: opts.isKnownType });
    if (!doc.meta.title && opts.name) doc.meta.title = baseName(opts.name);
    return { doc, format: "native", notices };
  }
  // Falstad's newer XML format (FIL-14) has no reader in @cs/formats yet.
  if (trimmed.startsWith("<cir")) throw new FormatError({ key: "falstad.xmlUnsupported" });
  const { doc, report } = importFalstad(trimmed);
  if (!doc.meta.title && opts.name) doc.meta.title = baseName(opts.name);
  const notices: MessageRef[] = [];
  if (report.unsupported.length) {
    const codes = [...new Set(report.unsupported.map((u) => u.code))].join(", ");
    notices.push({ key: "falstad.unsupported", values: { count: report.unsupported.length, codes } });
  }
  if (report.ignored.length) notices.push({ key: "falstad.ignored", values: { count: report.ignored.length } });
  notices.push(...report.warnings.map((w) => w.message));
  if (!Object.keys(doc.parts).length && !Object.keys(doc.wires).length && !report.unsupported.length) {
    throw new FormatError({ key: "file.notCircuit" });
  }
  return { doc, format: "falstad", notices, report };
}
