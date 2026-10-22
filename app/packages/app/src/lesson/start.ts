// Lesson start-up: `?lesson=<name or url>` (spec §19.1) -> fetch, validate,
// open the circuit, restore progress, and start the session.

import { checkAgainstCircuit, LessonEngine, loadLesson, progressKey, withLine, type LessonProblem, type ProgressStore } from "@cs/lesson";
import { openBrowserPersistence } from "@cs/persistence";
import type { AppController } from "../controller";
import { filesOf } from "../files";
import type { EmbedSession } from "../embed/start";
import { LessonSession } from "./session";
import { lessonOf, type LessonStatus } from "./state";
import { registerLessonCommands } from "./commands";

export { lessonOf, type LessonStatus } from "./state";

export const LESSONS_BASE = "./lessons/";

/**
 * "ohms-law" or "ohms-law.yaml" -> the book's lessons folder; anything with a
 * slash or scheme is an address relative to the page. Script and data URLs
 * are refused (LES-02).
 */
export function resolveLessonUrl(ref: string, pageHref: string): string | undefined {
  const r = ref.trim();
  if (!r || /^(javascript|data|blob):/i.test(r)) return undefined;
  const local = /^[\w.-]+$/.test(r) && !r.startsWith(".");
  const path = local ? LESSONS_BASE + (/\.ya?ml$/i.test(r) ? r : `${r}.yaml`) : r;
  try {
    const u = new URL(path, pageHref);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "file:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** A stable, anonymous learner id for this browser, used to seed random faults (§4.4). */
export function learnerId(storage: Pick<Storage, "getItem" | "setItem"> | undefined): string {
  try {
    const old = storage?.getItem("cs.learnerId");
    if (old) return old;
    const id = Math.random().toString(36).slice(2, 12);
    storage?.setItem("cs.learnerId", id);
    return id;
  } catch {
    return "anonymous";
  }
}

/** The persistence package's `lessons` store as a progress store (LES-13). */
export async function browserProgressStore(): Promise<ProgressStore | undefined> {
  try {
    const { persistence } = await openBrowserPersistence();
    const lessons = persistence.lessons;
    return {
      load: async (key) => (await lessons.get(key))?.progress,
      save: (key, progress) => lessons.put(key, { key, progress, changedAt: Date.now() }),
      clear: (key) => lessons.delete(key),
    };
  } catch {
    return undefined;
  }
}

export interface StartLessonOptions {
  embed?: EmbedSession;
  pageHref: string;
  /** The page whose progress this is (the embedding page when framed). */
  page: string;
  fetchText?: (url: string) => Promise<string>;
  store?: ProgressStore;
  learner?: string;
  shell?: () => Element | null;
}

export async function startLesson(c: AppController, ref: string, o: StartLessonOptions): Promise<LessonStatus> {
  const state = lessonOf(c);
  registerLessonCommands(c);
  const fail = (problems: LessonProblem[]): LessonStatus => {
    const s: LessonStatus = { kind: "error", ref, problems };
    state.set({ status: s });
    return s;
  };
  state.set({ status: { kind: "loading", ref } });
  const url = resolveLessonUrl(ref, o.pageHref);
  if (!url) return fail([{ message: `"${ref}" is not a lesson name or address.`, path: [], severity: "error" }]);
  const files = filesOf(c);
  const fetchText = o.fetchText ?? ((u: string) => files.platform.fetchText(u));

  let text: string;
  try {
    text = await fetchText(url);
  } catch (e) {
    return fail([{ message: `Could not load the lesson ${url}: ${(e as Error).message}`, path: [], severity: "error" }]);
  }
  const loaded = loadLesson(text);
  const lesson = loaded.lesson;
  if (!lesson) return fail(loaded.problems);

  // The starting circuit, relative to the lesson file.
  const src = lesson.circuit;
  let opened = true;
  try {
    if (src && "url" in src) {
      const curl = new URL(src.url, url).href;
      opened = await files.openText(await fetchText(curl), curl.split("/").pop(), undefined, { force: true });
    } else if (src && "example" in src) {
      opened = await files.openExample(src.example, { force: true });
    } else if (src && "inline" in src) {
      opened = await files.openText(JSON.stringify(src.inline), lesson.id, undefined, { force: true });
    }
  } catch (e) {
    return fail([{ message: `Could not load the lesson's circuit: ${(e as Error).message}`, path: ["circuit"], severity: "error" }]);
  }
  if (!opened) return fail([{ message: "The lesson's circuit could not be opened.", path: ["circuit"], severity: "error" }]);

  const problems = [...loaded.problems, ...checkAgainstCircuit(lesson, c.edits.doc).map((p) => withLine(p, loaded.locate))];
  if (problems.some((p) => p.severity === "error")) return fail(problems);

  const store = o.store ?? (await browserProgressStore());
  const key = progressKey(o.page, lesson.id);
  const saved = await store?.load(key).catch(() => undefined);
  const engine = new LessonEngine(lesson, { learnerId: o.learner ?? learnerId(globalThis.localStorage), progress: saved });

  o.embed?.reporter.builder.setCircuit(lesson.id, lesson.title);
  const session = new LessonSession(c, engine, {
    runtime: o.embed?.runtime,
    post: o.embed ? (type, payload) => o.embed!.bridge.post(type, payload) : undefined,
    reporter: o.embed?.reporter,
    store,
    key,
    problems,
    shell: o.shell,
  });
  session.start();
  const s: LessonStatus = { kind: "ready", session };
  state.set({ status: s });
  return s;
}
