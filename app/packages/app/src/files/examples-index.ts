// The example library index written by app/scripts/fetch-examples.mjs.

export interface ExampleEntry {
  category: string;
  title: string;
  file: string;
}

export interface ExampleIndex {
  source?: { repository: string; commit: string; path: string };
  credit?: string;
  license?: string;
  circuits: ExampleEntry[];
}

export interface ExampleCategory {
  name: string;
  entries: ExampleEntry[];
}

/** Group by category in index order, keeping only entries that match the search text. */
export function groupExamples(entries: ExampleEntry[], query = ""): ExampleCategory[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (e: ExampleEntry) => {
    const hay = `${e.category} ${e.title} ${e.file}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const out: ExampleCategory[] = [];
  const byName = new Map<string, ExampleCategory>();
  for (const e of entries) {
    if (!match(e)) continue;
    let cat = byName.get(e.category);
    if (!cat) {
      cat = { name: e.category, entries: [] };
      byName.set(e.category, cat);
      out.push(cat);
    }
    cat.entries.push(e);
  }
  return out;
}

let cached: Promise<ExampleIndex> | undefined;

export function loadExampleIndex(fetchText: (url: string) => Promise<string>, base: string): Promise<ExampleIndex> {
  cached ??= fetchText(base + "index.json")
    .then((s) => JSON.parse(s) as ExampleIndex)
    .catch((e) => {
      cached = undefined;
      throw e;
    });
  return cached;
}
