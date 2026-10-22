// What is saved after every step (embedding-lessons-xapi.md §4.5, LES-13).

/** A learner's answer to a step. */
export type Answer = { number: number; text?: string } | { choice: number } | { text: string } | { part: string };

export interface StepRecord {
  complete: boolean;
  /** Predictions and typed answers (the last one submitted). */
  answer?: Answer;
  /** For Measure, Troubleshoot and choice predictions with an answer: whether it was right. */
  correct?: boolean;
  /** Hints revealed (LES-10). */
  hints: number;
  /** Wrong submissions, including wrong parts clicked in Troubleshoot. */
  attempts: number;
  wrong: string[];
  /** Observe steps: the value shown beside the prediction (LES-04). */
  observed?: number;
}

export interface LessonProgress {
  version: 1;
  lessonId: string;
  /** Number of steps when saved; a changed lesson starts over. */
  stepCount: number;
  index: number;
  steps: StepRecord[];
  completed: boolean;
  startedAt: number;
  updatedAt: number;
}

export const emptyRecord = (): StepRecord => ({ complete: false, hints: 0, attempts: 0, wrong: [] });

/** Saved progress if it matches this lesson; otherwise undefined. */
export function restoreProgress(raw: unknown, lessonId: string, stepCount: number): LessonProgress | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Partial<LessonProgress>;
  if (p.version !== 1 || p.lessonId !== lessonId || p.stepCount !== stepCount || !Array.isArray(p.steps) || p.steps.length !== stepCount) return undefined;
  if (typeof p.index !== "number" || p.index < 0 || p.index >= stepCount) return undefined;
  return p as LessonProgress;
}

/** Where progress lives: the persistence package's `lessons` store, or a fake in tests. */
export interface ProgressStore {
  load(key: string): Promise<unknown>;
  save(key: string, progress: LessonProgress): Promise<void>;
  clear(key: string): Promise<void>;
}

/** One record per page and lesson, so the same lesson on two pages keeps two progress records. */
export const progressKey = (page: string, lessonId: string): string => `${page.replace(/[?#].*$/, "")}|${lessonId}`;
