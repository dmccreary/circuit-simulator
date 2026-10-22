#!/usr/bin/env node
// Downloads Paul Falstad's example circuits into app/public/circuits/ and
// writes index.json (category, title, file) for File → Examples (FIL-13, FIL-18).
//
// Source list: docs/list-of-circuits.md, which follows
//   src/com/lushprojects/circuitjs1/public/setuplist.txt in pfalstad/circuitjs1
// at the commit named on that page. Files come from
//   src/com/lushprojects/circuitjs1/public/circuits/<file> at the same commit.
// The circuits are GPL-2.0-or-later, so they are fetched at build time rather
// than committed (app/public/circuits/ is in the root .gitignore).
//
// Usage: node scripts/fetch-examples.mjs [--if-missing] [--force]
//   --if-missing  do nothing when index.json already exists (used by `npm run build`,
//                 so offline builds work); on network failure, warn and exit 0
//   --force       download every file again

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const LIST = join(APP, "..", "docs", "list-of-circuits.md");
const OUT = join(APP, "public", "circuits");
const REPO = "pfalstad/circuitjs1";
const DIR = "src/com/lushprojects/circuitjs1/public/circuits";
const DEFAULT_COMMIT = "5a707168778216bb6ed01bfdd62e8bbf7ae0a032";
const CONCURRENCY = 8;

const args = new Set(process.argv.slice(2));
const ifMissing = args.has("--if-missing");
const force = args.has("--force");

/** Parse the List of Circuits: `## Category`, `### Title`, then `Circuit file: [`x.txt`](...)`. */
export function parseList(md) {
  const commit = md.match(/\bat commit `([0-9a-f]{7,40})`/)?.[1];
  const full = md.match(/circuitjs1\/blob\/([0-9a-f]{40})\//)?.[1];
  const circuits = [];
  let category = null;
  let title = null;
  for (const line of md.split(/\r?\n/)) {
    const h2 = line.match(/^## (.+)$/);
    if (h2) {
      category = ["Sources", "Credits"].includes(h2[1].trim()) ? null : h2[1].trim();
      title = null;
      continue;
    }
    const h3 = line.match(/^### (.+)$/);
    if (h3) {
      title = h3[1].trim();
      continue;
    }
    const f = line.match(/^Circuit file: \[`([^`]+)`\]/);
    if (f && category && title) {
      if (/^[\w][\w.+-]*\.txt$/.test(f[1])) circuits.push({ category, title, file: f[1] });
      title = null;
    }
  }
  return { commit: full && commit && full.startsWith(commit) ? full : commit, circuits };
}

async function fetchText(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.text();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((res) => setTimeout(res, 500 * i));
    }
  }
}

async function main() {
  if (ifMissing && existsSync(join(OUT, "index.json"))) {
    console.log("fetch-examples: library present, skipping (use --force to refresh)");
    return;
  }
  const { commit: listed, circuits } = parseList(await readFile(LIST, "utf8"));
  // A short hash in the page cannot address raw files; use the known full hash for it.
  const commit = listed && listed.length === 40 ? listed : DEFAULT_COMMIT.startsWith(listed ?? "") ? DEFAULT_COMMIT : listed;
  const base = `https://raw.githubusercontent.com/${REPO}/${commit}/${DIR}/`;
  await mkdir(OUT, { recursive: true });

  const files = [...new Set(circuits.map((c) => c.file))];
  const failed = [];
  let fetched = 0;
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++];
      const dest = join(OUT, file);
      if (!force && existsSync(dest)) continue;
      try {
        await writeFile(dest, await fetchText(base + encodeURIComponent(file)));
        fetched++;
      } catch (e) {
        failed.push(`${file} (${e.message})`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const missing = new Set(files.filter((f) => !existsSync(join(OUT, f))));
  const index = {
    source: { repository: `https://github.com/${REPO}`, commit, path: DIR },
    credit: "Example circuits by Paul Falstad (CircuitJS1, falstad.com/circuit), GPL-2.0-or-later. Categories from setuplist.txt.",
    license: "https://github.com/pfalstad/circuitjs1/blob/master/README.md#license",
    circuits: circuits.filter((c) => !missing.has(c.file)),
  };
  await writeFile(join(OUT, "index.json"), JSON.stringify(index, null, 1) + "\n");
  await writeFile(
    join(OUT, "NOTICE"),
    [
      "These example circuits are from Paul Falstad's circuit simulator (CircuitJS1),",
      `https://github.com/${REPO}, ${DIR}/ at commit ${commit}.`,
      "They are free software under the GNU General Public License, version 2 or later:",
      "https://github.com/pfalstad/circuitjs1/blob/master/README.md#license",
      "See also https://www.falstad.com/licensing.html",
      "",
    ].join("\n"),
  );
  console.log(
    `fetch-examples: ${index.circuits.length} entries, ${files.length - missing.size}/${files.length} files present, ${fetched} downloaded` +
      (failed.length ? `, ${failed.length} failed: ${failed.slice(0, 10).join(", ")}${failed.length > 10 ? ", …" : ""}` : ""),
  );
  if (failed.length && !ifMissing) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.warn(`fetch-examples: ${e.message}`);
    // A build must not need the network: the app reports a missing library instead.
    if (!ifMissing) process.exitCode = 1;
  });
}
