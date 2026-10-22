// Opens every example in the built-in library (app/public/circuits/index.json,
// files-and-persistence.md §4.2, acceptance test 20), compiles it, runs the
// engine (see runTime() for how long), and prints a per-file outcome plus the
// unsupported Falstad element codes (placeholders) sorted by frequency. A file
// passes when it imports with no placeholders, compiles with no errors, and
// runs its whole run time with finite values; the pass count has a floor.
// The folder is fetched at build time (scripts/fetch-examples.mjs); when it is
// missing the test is skipped with a message.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "@cs/engine";
import { createPartResolver } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { exportFalstad, importFalstad } from "@cs/formats";
import { compile, type Netlist } from "@cs/model";

const DIR = fileURLToPath(new URL("../../public/circuits/", import.meta.url));
const INDEX = join(DIR, "index.json");
/** Every file runs for at least this much simulated time, or two periods of its slowest source (capped). */
const MIN_SECONDS = 10e-3;
const MAX_SECONDS = 0.2;
/** Step budget per file; a file that cannot reach its run time within it is "too-slow". */
const MAX_STEPS = Number(process.env.LIBRARY_MAX_STEPS ?? 250_000);

type Outcome = "pass" | "placeholders" | "compile-error" | "probe-unresolved" | "engine-error" | "import-error" | "too-slow";

/** Files that must pass (see the end of the first test), and the margin below the library size. */
const PASS_FLOOR = 362;
const PASS_MARGIN = 3;

/** Periods of the slowest source a run must cover when that is less than MIN_SECONDS (RF circuits). */
const MIN_PERIODS = 200;

/**
 * At least MIN_SECONDS and two periods of the slowest periodic source, at most MAX_SECONDS;
 * a circuit whose slowest source is very fast (a 40 MHz transmission line) runs MIN_PERIODS of it.
 */
function runTime(periods: readonly number[], netlist: Netlist, falstadStep: number | undefined): number {
  const slowest = periods.length ? Math.max(...periods) : Infinity;
  return Math.min(
    MAX_SECONDS,
    MIN_PERIODS * slowest,
    lineCap(netlist),
    !periods.length && falstadStep && falstadStep > 0 ? FALSTAD_STEPS * falstadStep : Infinity,
    Math.max(MIN_SECONDS, 2 * (Number.isFinite(slowest) ? slowest : 0)),
  );
}

/**
 * Self-oscillating RF circuits (a 400 MHz varactor VCO, a joule thief) have no
 * source period to go by; they run at least this many of the time steps their
 * Falstad file uses, the time CircuitJS1 itself shows in a few seconds.
 */
const FALSTAD_STEPS = 20_000;

/** Steps a transmission line's delay allows: no step may exceed the delay (as in CircuitJS1's TransLineElm). */
const LINE_DELAYS = 20_000;

function lineCap(netlist: Netlist): number {
  let cap = Infinity;
  for (const el of netlist.elements) {
    const d = el.props.delay;
    if (el.type === "transmission-line" && typeof d === "number" && d > 0) cap = Math.min(cap, LINE_DELAYS * d);
  }
  return cap;
}

function finite(state: Float64Array): boolean {
  for (let i = 0; i < state.length; i++) if (!Number.isFinite(state[i])) return false;
  return true;
}

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
    // Every imported scope must record something, or the chart stays empty.
    const unresolved = Object.values(imported.doc.probes).filter((p) => !compiled.channels[p.id]);
    if (unresolved.length)
      return { ...base, outcome: "probe-unresolved", detail: unresolved.map((p) => `${p.name}:${p.target.kind}`).join(", ") };
    const e = createEngine(compiled.netlist, getModelFactory);
    if (e.status !== "ok") return { ...base, outcome: "engine-error", detail: e.diagnostics.map((d) => d.message.key).join(",") };
    const until = runTime(e.timeScales.sourcePeriods, compiled.netlist, imported.report.settings?.timeStep);
    if (!finite(e.displayState())) return { ...base, outcome: "engine-error", detail: "non-finite at t=0" };
    let k = 0;
    for (; k < MAX_STEPS && e.time < until; k++) {
      const out = e.step();
      e.drainSamples();
      const why = e.diagnostics.find((d) => d.severity === "error")?.message.key ?? "";
      if (!out.ok) return { ...base, outcome: "engine-error", detail: `${why} t=${e.time.toExponential(2)}` };
      if (!finite(e.displayState())) return { ...base, outcome: "engine-error", detail: `non-finite at t=${e.time.toExponential(2)}` };
    }
    if (e.time < until * (1 - 1e-9)) {
      return { ...base, outcome: "too-slow", detail: `t=${e.time.toExponential(2)} of ${until.toExponential(2)} in ${k} steps` };
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
  test("every file imports without throwing", async () => {
    const index = JSON.parse(readFileSync(INDEX, "utf8")) as { circuits: { file: string }[] };
    const files = [...new Set(index.circuits.map((c) => c.file))];
    const results: ReturnType<typeof runOne>[] = [];
    for (const f of files) {
      results.push(runOne(f));
      await new Promise((r) => setTimeout(r, 0)); // let the test runner's RPC through
    }

    const freq = new Map<string, { count: number; files: number }>();
    for (const r of results) {
      for (const c of r.codes) freq.set(c, { count: (freq.get(c)?.count ?? 0) + 1, files: freq.get(c)?.files ?? 0 });
      for (const c of new Set(r.codes)) freq.get(c)!.files++;
    }
    const tally = (o: Outcome) => results.filter((r) => r.outcome === o).length;
    const lines = [
      `Library: ${files.length} files — pass ${tally("pass")}, placeholders ${tally("placeholders")}, ` +
        `compile-error ${tally("compile-error")}, probe-unresolved ${tally("probe-unresolved")}, engine-error ${tally("engine-error")}, too-slow ${tally("too-slow")}, ` +
        `import-error ${tally("import-error")}`,
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
    // Regression floor: every file passed when this was last raised (365 of 365); a small
    // margin absorbs a file the library fetch adds or changes. Raise it, never lower it.
    expect(tally("pass")).toBeGreaterThanOrEqual(Math.min(PASS_FLOOR, files.length - PASS_MARGIN));
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

