import { lazy, Suspense } from "react";
import { useController } from "../ui/context";
import { useStore } from "../store";
import { lessonOf, type LessonStatus } from "./state";

// The panel, the engine and the YAML parser load only in lesson mode.
const LessonHost = lazy(() => import("./LessonPanel").then((m) => ({ default: m.LessonHost })));
const hasLesson = (s: { status: LessonStatus }) => s.status.kind !== "none";

/** Where the shell shows the lesson panel; renders nothing without a lesson. */
export function LessonSlot() {
  const c = useController();
  const active = useStore(lessonOf(c), hasLesson);
  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <LessonHost />
    </Suspense>
  );
}
