// The lesson state of a controller. Kept free of the lesson engine and the
// YAML parser, so the shell can check for a lesson without loading them.

import type { LessonProblem } from "@cs/lesson";
import type { AppController } from "../controller";
import { createStore, type Store } from "../store";
import type { LessonSession } from "./session";

export type LessonStatus =
  | { kind: "none" }
  | { kind: "loading"; ref: string }
  | { kind: "error"; ref: string; problems: LessonProblem[] }
  | { kind: "ready"; session: LessonSession };

const registry = new WeakMap<AppController, Store<{ status: LessonStatus }>>();

/** The lesson state of a controller, for the panel. */
export function lessonOf(c: AppController): Store<{ status: LessonStatus }> {
  let s = registry.get(c);
  if (!s) {
    s = createStore<{ status: LessonStatus }>({ status: { kind: "none" } });
    registry.set(c, s);
  }
  return s;
}
