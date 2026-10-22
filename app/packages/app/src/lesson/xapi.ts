import { ACTIVITY_TYPE, ext, type Activity, type Result, type StatementBuilder, type VerbName, type XapiReporter } from "@cs/xapi";
import type { Answer, EngineEvent, LessonEngine } from "@cs/lesson";

/** A step as an xAPI activity, under the lesson's root activity. */
function stepActivity(b: StatementBuilder, e: LessonEngine, index: number): Activity {
  const root = b.rootActivity();
  const s = e.lesson.steps[index];
  return {
    objectType: "Activity",
    id: `${root.id}/step/${index + 1}`,
    definition: { name: { "en-US": s.title ?? `${e.lesson.title}, step ${index + 1}` }, type: ACTIVITY_TYPE.interaction },
  };
}

function lessonActivity(b: StatementBuilder, e: LessonEngine): Activity {
  const root = b.rootActivity();
  return { ...root, definition: { name: { "en-US": e.lesson.title }, type: ACTIVITY_TYPE.lesson } };
}

/** What may leave the page: typed explanations only when the lesson allows it (XAP-05). */
function response(e: LessonEngine, index: number, a: Answer): string | undefined {
  const s = e.lesson.steps[index];
  if ("number" in a) return a.text ?? String(a.number);
  if ("choice" in a) return "options" in s && s.options ? s.options[a.choice] : String(a.choice);
  if ("part" in a) return a.part;
  return s.type === "explain" && s.reportText ? a.text : undefined;
}

/** Lesson events as statements (spec Section 21.2): attempted, answered, progressed, completed. */
export function reportLessonEvent(reporter: XapiReporter, e: LessonEngine, ev: EngineEvent): void {
  const make = (verb: VerbName, object: (b: StatementBuilder) => Activity, result?: Result) => reporter.record((b) => b.build(verb, object(b), result));
  const stepExt = (i: number) => ({ [ext("step")]: i + 1, [ext("steps")]: e.count, [ext("step-type")]: e.lesson.steps[i].type });
  switch (ev.type) {
    case "enter":
      if (ev.index === 0) make("attempted", (b) => lessonActivity(b, e));
      return;
    case "hint":
      make("interacted", (b) => stepActivity(b, e, ev.index), { extensions: { ...stepExt(ev.index), [ext("action")]: "hint", [ext("hint")]: ev.hint } });
      return;
    case "answer": {
      const r = response(e, ev.index, ev.answer);
      make("answered", (b) => stepActivity(b, e, ev.index), {
        ...(r !== undefined ? { response: r } : {}),
        ...(ev.correct !== undefined ? { success: ev.correct } : {}),
        extensions: stepExt(ev.index),
      });
      return;
    }
    case "complete": {
      const rec = e.record(ev.index);
      make("progressed", (b) => stepActivity(b, e, ev.index), {
        completion: true,
        extensions: { ...stepExt(ev.index), [ext("hints")]: rec.hints, [ext("attempts")]: rec.attempts, ...(rec.wrong.length ? { [ext("wrong")]: rec.wrong } : {}) },
      });
      return;
    }
    case "finished": {
      const s = e.summary();
      make("completed", (b) => lessonActivity(b, e), {
        completion: true,
        extensions: { [ext("steps-done")]: s.done, [ext("steps")]: s.count, [ext("hints")]: s.hints },
      });
      return;
    }
  }
}
