// Writes JSON in the "one record per line" style of files-and-persistence.md §2.2.

/** Single-line JSON with a space after each colon and comma: `{ "a": 1, "b": [0, 0] }`. */
export function inline(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
  if (entries.length === 0) return "{}";
  return `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }`;
}

/** Arrays become one element per line; objects listed in `byKey` become one key per line. */
export function block(v: unknown, indent: string, byKey: boolean): string {
  const inner = indent + "  ";
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return `[\n${v.map((x) => inner + inline(x)).join(",\n")}\n${indent}]`;
  }
  if (byKey && v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (entries.length === 0) return "{}";
    return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${inline(x)}`).join(",\n")}\n${indent}}`;
  }
  return inline(v);
}

/** The top-level object: one key per line; arrays and the listed keys expanded one level. */
export function writeTopLevel(obj: Record<string, unknown>, expandKeys: Set<string>): string {
  const lines = Object.entries(obj)
    .filter(([, x]) => x !== undefined)
    .map(([k, x]) => `  ${JSON.stringify(k)}: ${block(x, "  ", expandKeys.has(k))}`);
  return `{\n${lines.join(",\n")}\n}\n`;
}
