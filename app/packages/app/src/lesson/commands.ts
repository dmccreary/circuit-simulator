import { stepSnapshotYaml } from "@cs/lesson";
import type { AppController } from "../controller";
import { addMessages, t } from "../messages";
import { filesOf } from "../files";
import { lessonOf } from "./state";

addMessages({
  "lesson.next": "Next step",
  "lesson.back": "Previous step",
  "lesson.hint": "Show a hint",
  "lesson.resetStep": "Reset step",
  "lesson.copyStepYaml": "Copy step snapshot as YAML",
  "lesson.copied": "Copied a lesson step that checks the selected parts.",
  "lesson.copyFailed": "Could not copy to the clipboard.",
});

/** Copy a `do` step that checks the selection as it is now (author mode, LES-15). */
export async function copyStepSnapshot(c: AppController): Promise<string> {
  const yaml = stepSnapshotYaml(c.edits.doc, c.store.get().selection);
  const files = filesOf(c);
  const ok = await files.platform.copyText(yaml).catch(() => false);
  files.notify(t(ok ? "lesson.copied" : "lesson.copyFailed"), !ok);
  return yaml;
}

/** Lesson commands. The `lesson.*` steps act only while a lesson is running. */
export function registerLessonCommands(c: AppController): void {
  const r = c.commands;
  if (r.get("lesson.copyStepYaml")) return;
  const session = () => {
    const s = lessonOf(c).get().status;
    return s.kind === "ready" ? s.session : undefined;
  };
  const active = () => !!session();
  r.register({ id: "lesson.next", label: { key: "lesson.next" }, when: () => !!session()?.engine.canNext, run: () => session()?.next() });
  r.register({ id: "lesson.back", label: { key: "lesson.back" }, when: () => !!session()?.engine.canBack, run: () => session()?.back() });
  r.register({ id: "lesson.hint", label: { key: "lesson.hint" }, when: () => !!session()?.engine.hasMoreHints, run: () => session()?.hint() });
  r.register({ id: "lesson.resetStep", label: { key: "lesson.resetStep" }, when: active, run: () => session()?.resetStep() });
  r.register({ id: "lesson.copyStepYaml", label: { key: "lesson.copyStepYaml" }, run: (ctx) => void copyStepSnapshot(ctx) });
}
