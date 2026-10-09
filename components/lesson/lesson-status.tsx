"use client";

import { CheckCircle2, Circle, CircleDot } from "lucide-react";

import { useProgress } from "@/components/progress/progress-provider";
import type { LessonMeta } from "@/lib/types";
import type { LessonProgress } from "@/lib/progress";

export type LessonState = "done" | "started" | "new";

export function lessonState(meta: Pick<LessonMeta, "exerciseIds">, p: LessonProgress | undefined): LessonState {
  if (!p) return "new";
  if (p.completed) return "done";
  const anyExercise = meta.exerciseIds.some((id) => p.exercises[id]?.passed || p.exercises[id]?.code);
  return anyExercise || Object.keys(p.quizzes).length > 0 ? "started" : "new";
}

export function LessonStatusIcon({
  lesson,
  className = "size-4",
}: {
  lesson: Pick<LessonMeta, "key" | "exerciseIds">;
  className?: string;
}) {
  const progress = useProgress();
  const state = lessonState(lesson, progress.lesson(lesson.key));
  if (state === "done") return <CheckCircle2 className={`${className} text-emerald-600`} aria-label="Completed" />;
  if (state === "started") return <CircleDot className={`${className} text-blue-600`} aria-label="In progress" />;
  return <Circle className={`${className} text-zinc-300 dark:text-zinc-600`} aria-label="Not started" />;
}

/** Percentage of lessons completed across a set of lessons. */
export function useCompletion(lessons: Pick<LessonMeta, "key">[]) {
  const progress = useProgress();
  const done = lessons.filter((l) => progress.lesson(l.key)?.completed).length;
  return { done, total: lessons.length, percent: lessons.length ? Math.round((done / lessons.length) * 100) : 0 };
}

export function ProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 ${className}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function CompletionBar({ lessons, label = true }: { lessons: Pick<LessonMeta, "key">[]; label?: boolean }) {
  const { done, total, percent } = useCompletion(lessons);
  return (
    <div>
      <ProgressBar percent={percent} />
      {label && (
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {done}/{total} complete
        </div>
      )}
    </div>
  );
}
