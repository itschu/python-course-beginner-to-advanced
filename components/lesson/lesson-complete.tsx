"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { useProgress } from "@/components/progress/progress-provider";
import type { LessonMeta } from "@/lib/types";

export function LessonComplete({
  lesson,
  nextHref,
  nextTitle,
}: {
  lesson: Pick<LessonMeta, "key" | "exerciseIds" | "quizIds" | "kind">;
  nextHref?: string;
  nextTitle?: string;
}) {
  const progress = useProgress();
  const p = progress.lesson(lesson.key);
  const passed = lesson.exerciseIds.filter((id) => p?.exercises[id]?.passed).length;
  const quizzesDone = lesson.quizIds.filter((id) => p?.quizzes[id]).length;
  const completed = Boolean(p?.completed);
  const allExercises = passed === lesson.exerciseIds.length;

  return (
    <div className="mt-12 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="m-0 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {completed ? "Lesson complete" : "Finished this lesson?"}
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {lesson.exerciseIds.length > 0 && (
              <>
                Exercises passed: {passed}/{lesson.exerciseIds.length}.{" "}
              </>
            )}
            {lesson.quizIds.length > 0 && (
              <>
                Quizzes taken: {quizzesDone}/{lesson.quizIds.length}.{" "}
              </>
            )}
            {!completed && !allExercises && "You can mark it complete now, but passing every exercise first makes it stick."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => progress.setLessonCompleted(lesson.key, !completed)}
            className={completed ? "btn btn-ghost" : "btn btn-success"}
          >
            <CheckCircle2 className="size-4" aria-hidden />
            {completed ? "Mark as not done" : "Mark as complete"}
          </button>
          {nextHref && (
            <Link href={nextHref} className="btn btn-primary">
              Next: {nextTitle} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
