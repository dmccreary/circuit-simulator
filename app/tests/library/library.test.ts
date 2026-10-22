// Opens every example in the built-in library (app/public/circuits/index.json,
// files-and-persistence.md §4.2, acceptance test 20), compiles it, runs the
// engine for a short simulated time, and prints a per-file outcome plus the
// unsupported Falstad element codes (placeholders) sorted by frequency.
// The folder is fetched at build time (scripts/fetch-examples.mjs); when it is
// missing the test is skipped with a message.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "@cs/engine";
import { createPartResolver } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { exportFalstad, importFalstad } from "@cs/formats";
import { compile } from "@cs/model";

const DIR = fileURLToPath(new URL("../../public/circuits/", import.meta.url));
const INDEX = join(DIR, "index.json");
const RUN_SECONDS = 1e-3;
const MAX_STEPS = 400;

type Outcome = "pass" | "placeholders" | "compile-error" | "engine-error" | "import-error";

interface FileResult {
  file: string;
  warnings: string[];
  outcome: Outcome;
  placeholders: number;
  detail: string;
}

function runOne(file: string): FileResult & { codes: string[] } {
  const text = readFileSync(join(DIR, file), "utf8");
  let imported;
  try {
    imported = importFalstad(text);
  } catch (e) {
    return { file, outcome: "import-error", placeholders: 0, detail: String(e), codes: [], warnings: [] };
  }
  if (text.trimStart().startsWith("<cir") && !Object.keys(imported.doc.parts).length) {
    return { file, outcome: "import-error", placeholders: 0, detail: "Falstad XML not read", codes: [], warnings: [] };
  }
  const codes = imported.report.unsupported.map((u) => u.code);
  const base = { file, placeholders: codes.length, codes, warnings: imported.report.warnings.map((w) => w.message.key) };
  try {
    const compiled = compile(imported.doc, createPartResolver());
    const errors = compiled.diagnostics.filter((d) => d.severity === "error");
    if (errors.length) return { ...base, outcome: "compile-error", detail: errors.map((d) => d.message.key).join(",") };
    const e = createEngine(compiled.netlist, getModelFactory);
    if (e.status !== "ok") return { ...base, outcome: "engine-error", detail: e.diagnostics.map((d) => d.message.key).join(",") };
    for (let k = 0; k < MAX_STEPS && e.time < RUN_SECONDS; k++) {
      const out = e.step();
      e.drainSamples();
      if (!out.ok) return { ...base, outcome: "engine-error", detail: `t=${e.time.toExponential(2)}` };
    }
  } catch (err) {
    return { ...base, outcome: "engine-error", detail: String(err).slice(0, 120) };
  }
  return { ...base, outcome: codes.length ? "placeholders" : "pass", detail: "" };
}

const hasLibrary = existsSync(INDEX);
if (!hasLibrary) {
  console.warn(`Library test skipped: ${INDEX} is missing. Run "npm run fetch-examples" to download the examples.`);
}

describe.skipIf(!hasLibrary)("built-in example library", () => {
  test("every file imports without throwing", () => {
    const index = JSON.parse(readFileSync(INDEX, "utf8")) as { circuits: { file: string }[] };
    const files = [...new Set(index.circuits.map((c) => c.file))];
    const results = files.map(runOne);

    const freq = new Map<string, { count: number; files: number }>();
    for (const r of results) {
      for (const c of r.codes) freq.set(c, { count: (freq.get(c)?.count ?? 0) + 1, files: freq.get(c)?.files ?? 0 });
      for (const c of new Set(r.codes)) freq.get(c)!.files++;
    }
    const tally = (o: Outcome) => results.filter((r) => r.outcome === o).length;
    const lines = [
      `Library: ${files.length} files — pass ${tally("pass")}, placeholders ${tally("placeholders")}, ` +
        `compile-error ${tally("compile-error")}, engine-error ${tally("engine-error")}, import-error ${tally("import-error")}`,
      "",
      "Placeholders by frequency (code: elements / files):",
      ...[...freq.entries()]
        .sort((a, b) => b[1].files - a[1].files || b[1].count - a[1].count)
        .map(([c, f]) => `  ${c.padEnd(18)} ${String(f.count).padStart(5)} / ${f.files}`),
      "",
      "Import warnings (key: count / files):",
      ...[...new Set(results.flatMap((r) => r.warnings))].map(
        (k) =>
          `  ${k.padEnd(24)} ${String(results.reduce((n, r) => n + r.warnings.filter((w) => w === k).length, 0)).padStart(5)} / ${results.filter((r) => r.warnings.includes(k)).length}`,
      ),
      "",
      "Files that did not run cleanly:",
      ...results
        .filter((r) => r.outcome !== "pass" && r.outcome !== "placeholders")
        .map((r) => `  ${r.file.padEnd(24)} ${r.outcome.padEnd(14)} ${r.detail}`),
    ];
    console.log(lines.join("\n"));
    if (process.env.LIBRARY_DETAIL) {
      console.log(results.map((r) => `${r.file}\t${r.outcome}\t${r.placeholders}\t${r.codes.join(" ")}\t${r.detail}`).join("\n"));
    }
    expect(results.filter((r) => r.outcome === "import-error" && r.detail !== "Falstad XML not read").map((r) => `${r.file}: ${r.detail}`)).toEqual([]);
  }, 300_000);

  test("imported files export back to Falstad text that re-imports to the same parts (FIL-19)", () => {
    const index = JSON.parse(readFileSync(INDEX, "utf8")) as { circuits: { file: string }[] };
    const files = [...new Set(index.circuits.map((c) => c.file))];
    const skipped = new Map<string, number>();
    const mismatched: string[] = [];
    let exported = 0;
    for (const file of files) {
      const { doc } = importFalstad(readFileSync(join(DIR, file), "utf8"));
      const { text, report } = exportFalstad(doc);
      for (const s of report.skipped) skipped.set(s.type, (skipped.get(s.type) ?? 0) + 1);
      if (report.skipped.length) continue;
      exported++;
      const again = importFalstad(text).doc;
      // Every part comes back in place (a placeholder may come back as the part it stood for).
      const back = new Set(Object.values(again.parts).map((p) => `${p.type}@${p.at.x},${p.at.y}`));
      const lost = Object.values(doc.parts).filter((p) => p.type !== "falstad:placeholder" && !back.has(`${p.type}@${p.at.x},${p.at.y}`));
      if (lost.length) mismatched.push(`${file}: ${lost.map((p) => p.type).join(", ")}`);
    }
    console.log(
      `Falstad export: ${exported}/${files.length} files written whole; parts skipped by type: ` +
        ([...skipped.entries()].map(([t, k]) => `${t} ${k}`).join(", ") || "none"),
    );
    expect(mismatched).toEqual([]);
  }, 300_000);
});

