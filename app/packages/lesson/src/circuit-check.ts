// Checks a valid lesson against its circuit: unknown labels, impossible checks (LES-16).

import type { CircuitDocument } from "@cs/model";
import { checkPartRefs } from "./checks";
import { findPart, findProbe } from "./context";
import type { Check, Lesson, LessonProblem, Permissions, ValueRef } from "./types";

export function checkAgainstCircuit(lesson: Lesson, doc: CircuitDocument): LessonProblem[] {
  const out: LessonProblem[] = [];
  const known = (ref: string) => !!findPart(doc, ref);
  const warnPart = (path: (string | number)[], ref: string, what: string) => {
    if (!known(ref)) out.push({ path, severity: "warning", message: `${what} names part "${ref}", which is not in the circuit.` });
  };
  const perms = (p: Permissions | undefined, path: (string | number)[]) => {
    if (p?.locked && p.locked !== "all") p.locked.forEach((l, i) => warnPart([...path, "locked", i], l, "locked"));
  };
  const valueRef = (v: ValueRef | undefined, path: (string | number)[], what: string) => {
    if (!v) return;
    if ("part" in v) warnPart(path, v.part, what);
    else if (!findProbe(doc, v.probe)) out.push({ path, severity: "warning", message: `${what} names probe "${v.probe}", which is not in the circuit.` });
  };
  const check = (c: Check, path: (string | number)[]) => {
    for (const ref of checkPartRefs(c)) warnPart(path, ref, "A check");
  };

  perms(lesson.permissions, ["permissions"]);
  lesson.steps.forEach((s, i) => {
    const sp = ["steps", i];
    perms(s.permissions, [...sp, "permissions"]);
    s.spotlight.forEach((ref, j) => {
      if (!ref.includes(":")) warnPart([...sp, "spotlight", j], ref, "spotlight");
    });
    s.feedback.forEach((f, j) => "when" in f && check(f.when, [...sp, "feedback", j, "when"]));
    if (s.type === "do") check(s.check, [...sp, "do", "check"]);
    if (s.type === "measure") valueRef(s.value, [...sp, "measure", "value"], "measure");
    if (s.type === "observe") valueRef(s.show, [...sp, "observe", "show"], "show");
    if (s.type === "troubleshoot")
      s.faults.forEach((f, j) => {
        // A fault on a missing part could never be found: that is an error.
        if (!known(f.part)) out.push({ path: [...sp, "troubleshoot", "faults", j], severity: "error", message: `The fault names part "${f.part}", which is not in the circuit.` });
      });
  });
  return out;
}
