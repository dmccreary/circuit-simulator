// YAML text -> validated Lesson, with line numbers on every problem (LES-16).

import { LineCounter, isMap, isNode, isScalar, isSeq, parseDocument, type Document } from "yaml";
import { validateLesson } from "./validate";
import type { Lesson, LessonProblem } from "./types";

export interface LoadResult {
  lesson?: Lesson;
  problems: LessonProblem[];
  /** Line of a path in the source, for problems found later (circuit checks). */
  locate(path: (string | number)[]): { line: number; column: number } | undefined;
}

/** Parse and validate a lesson file. `lesson` is set only when there are no errors. */
export function loadLesson(text: string): LoadResult {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false, uniqueKeys: true });
  const locate = (path: (string | number)[]) => locateIn(doc, lineCounter, path);
  const yamlProblems: LessonProblem[] = [...doc.errors, ...doc.warnings].map((e) => {
    const pos = lineCounter.linePos(e.pos[0]);
    return {
      message: e.message.split("\n")[0],
      path: [],
      line: pos.line,
      column: pos.col,
      severity: doc.errors.includes(e as never) ? "error" : "warning",
    };
  });
  if (doc.errors.length) return { problems: yamlProblems, locate };
  let raw: unknown;
  try {
    // Aliases are capped so a malicious file cannot expand without bound.
    raw = doc.toJS({ maxAliasCount: 50 });
  } catch (e) {
    return { problems: [{ message: (e as Error).message, path: [], severity: "error" }], locate };
  }
  const r = validateLesson(raw);
  const problems = [...yamlProblems, ...r.problems.map((p) => withLine(p, locate))];
  return { lesson: r.lesson, problems, locate };
}

export function withLine(p: LessonProblem, locate: LoadResult["locate"]): LessonProblem {
  if (p.line !== undefined) return p;
  const at = locate(p.path);
  return at ? { ...p, line: at.line, column: at.column } : p;
}

/**
 * Where a path starts: the key of a mapping entry, or a list item. A path
 * that does not exist points at its deepest existing ancestor, so a missing
 * field is reported on the line of the mapping that lacks it.
 */
function locateIn(doc: Document, lc: LineCounter, path: (string | number)[]): { line: number; column: number } | undefined {
  for (let n = path.length; n >= 1; n--) {
    const parent = n === 1 ? doc.contents : doc.getIn(path.slice(0, n - 1), true);
    const key = path[n - 1];
    let range: readonly number[] | null | undefined;
    if (isMap(parent)) {
      const pair = parent.items.find((it) => (isScalar(it.key) ? it.key.value : it.key) === key);
      range = pair && isNode(pair.key) ? pair.key.range : undefined;
    } else if (isSeq(parent) && typeof key === "number") {
      const item = parent.items[key];
      range = isNode(item) ? item.range : undefined;
    }
    if (range) {
      const pos = lc.linePos(range[0]);
      return { line: pos.line, column: pos.col };
    }
  }
  const root = doc.contents;
  if (isNode(root) && root.range) {
    const pos = lc.linePos(root.range[0]);
    return { line: pos.line, column: pos.col };
  }
  return undefined;
}

/** "Line 12: ..." for a problem list shown to the author. */
export function formatProblem(p: LessonProblem): string {
  const where = p.line !== undefined ? `Line ${p.line}` : p.path.length ? p.path.join(".") : "Lesson";
  return `${where}: ${p.message}`;
}
