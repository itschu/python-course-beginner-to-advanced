/**
 * Progress data model, shared by the browser (localStorage) and the server
 * (Postgres). Merging is commutative so two devices never lose each other's work:
 * a passed exercise stays passed, the best quiz score wins, and saved code
 * comes from whichever copy was edited last.
 */

export interface ExerciseProgress {
  passed: boolean;
  passedAt?: string;
  code?: string;
  updatedAt: string;
}

export interface QuizProgress {
  best: number;
  last: number;
  total: number;
  updatedAt: string;
}

export interface LessonProgress {
  completed: boolean;
  completedAt?: string;
  exercises: Record<string, ExerciseProgress>;
  quizzes: Record<string, QuizProgress>;
  updatedAt: string;
}

export type ProgressData = Record<string, LessonProgress>;

export const LESSON_KEY_RE = /^[a-z0-9-]{1,80}\/[a-z0-9-]{1,80}$/;
const ID_RE = /^[a-z0-9-]{1,80}$/;
const MAX_CODE = 50_000;

export function emptyLesson(now = new Date().toISOString()): LessonProgress {
  return { completed: false, exercises: {}, quizzes: {}, updatedAt: now };
}

const later = (a?: string, b?: string) => ((a ?? "") >= (b ?? "") ? a : b);
const earlier = (a?: string, b?: string) => (!a ? b : !b ? a : a <= b ? a : b);

export function mergeLesson(a: LessonProgress | undefined, b: LessonProgress | undefined): LessonProgress {
  if (!a) return b ?? emptyLesson();
  if (!b) return a;
  const exercises: Record<string, ExerciseProgress> = {};
  for (const id of new Set([...Object.keys(a.exercises), ...Object.keys(b.exercises)])) {
    const x = a.exercises[id];
    const y = b.exercises[id];
    if (!x || !y) {
      exercises[id] = (x ?? y)!;
      continue;
    }
    const newest = x.updatedAt >= y.updatedAt ? x : y;
    exercises[id] = {
      passed: x.passed || y.passed,
      passedAt: earlier(x.passedAt, y.passedAt),
      code: newest.code ?? (newest === x ? y.code : x.code),
      updatedAt: later(x.updatedAt, y.updatedAt)!,
    };
  }
  const quizzes: Record<string, QuizProgress> = {};
  for (const id of new Set([...Object.keys(a.quizzes), ...Object.keys(b.quizzes)])) {
    const x = a.quizzes[id];
    const y = b.quizzes[id];
    if (!x || !y) {
      quizzes[id] = (x ?? y)!;
      continue;
    }
    const newest = x.updatedAt >= y.updatedAt ? x : y;
    quizzes[id] = {
      best: Math.max(x.best, y.best),
      last: newest.last,
      total: Math.max(x.total, y.total),
      updatedAt: newest.updatedAt,
    };
  }
  return {
    completed: a.completed || b.completed,
    completedAt: earlier(a.completedAt, b.completedAt),
    exercises,
    quizzes,
    updatedAt: later(a.updatedAt, b.updatedAt)!,
  };
}

export function mergeProgress(a: ProgressData, b: ProgressData): ProgressData {
  const out: ProgressData = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[key] = mergeLesson(a[key], b[key]);
  }
  return out;
}

const isoOr = (v: unknown, fallback: string) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback;

/** Coerce untrusted JSON (localStorage, request bodies, imports) into valid progress. */
export function sanitizeLesson(input: unknown): LessonProgress | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const now = new Date().toISOString();
  const lesson: LessonProgress = {
    completed: raw.completed === true,
    completedAt: raw.completed === true ? isoOr(raw.completedAt, now) : undefined,
    exercises: {},
    quizzes: {},
    updatedAt: isoOr(raw.updatedAt, now),
  };
  if (raw.exercises && typeof raw.exercises === "object") {
    for (const [id, value] of Object.entries(raw.exercises as Record<string, unknown>)) {
      if (!ID_RE.test(id) || !value || typeof value !== "object") continue;
      const e = value as Record<string, unknown>;
      lesson.exercises[id] = {
        passed: e.passed === true,
        passedAt: e.passed === true ? isoOr(e.passedAt, now) : undefined,
        code: typeof e.code === "string" ? e.code.slice(0, MAX_CODE) : undefined,
        updatedAt: isoOr(e.updatedAt, now),
      };
    }
  }
  if (raw.quizzes && typeof raw.quizzes === "object") {
    for (const [id, value] of Object.entries(raw.quizzes as Record<string, unknown>)) {
      if (!ID_RE.test(id) || !value || typeof value !== "object") continue;
      const q = value as Record<string, unknown>;
      const total = Math.max(0, Math.min(1000, Number(q.total) || 0));
      const clamp = (n: unknown) => Math.max(0, Math.min(total, Number(n) || 0));
      lesson.quizzes[id] = {
        best: clamp(q.best),
        last: clamp(q.last),
        total,
        updatedAt: isoOr(q.updatedAt, now),
      };
    }
  }
  return lesson;
}

export function sanitizeProgress(input: unknown): ProgressData {
  const out: ProgressData = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!LESSON_KEY_RE.test(key)) continue;
    const lesson = sanitizeLesson(value);
    if (lesson) out[key] = lesson;
  }
  return out;
}

export function lessonDone(p: LessonProgress | undefined): boolean {
  return Boolean(p?.completed);
}
