import { Flag, Hammer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CompletionBar, LessonStatusIcon } from "@/components/lesson/lesson-status";
import { getCourseStats, getLessonMetas, getPhases } from "@/lib/content";

export const metadata: Metadata = {
  title: "Course roadmap",
  description: "Every phase and lesson in the course, from Python basics to deploying ML models.",
};

export default function LearnPage() {
  const phases = getPhases();
  const stats = getCourseStats();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Course roadmap</h1>
      <p className="mt-3 max-w-3xl text-zinc-600 dark:text-zinc-400">
        {stats.phases} phases, {stats.lessons} lessons, {stats.exercises} tested exercises, {stats.quizzes} quizzes,{" "}
        {stats.projects} projects and {stats.checkpoints} checkpoint tests. Work through them in order: each phase builds on
        the last.
      </p>

      <div className="mt-10 space-y-8">
        {phases.map((phase) => {
          const lessons = getLessonMetas(phase.slug);
          return (
            <section key={phase.slug} className="card overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-zinc-200 p-6 sm:flex-row sm:items-start dark:border-zinc-800">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
                  {phase.number}
                </span>
                <div className="flex-1">
                  <Link href={`/learn/${phase.slug}`} className="hover:underline">
                    <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{phase.title}</h2>
                  </Link>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{phase.description}</p>
                  <p className="mt-2 text-xs text-zinc-500">{phase.weeks}</p>
                </div>
                {lessons.length > 0 && (
                  <div className="w-full sm:w-44">
                    <CompletionBar lessons={lessons} />
                  </div>
                )}
              </div>
              {lessons.length > 0 ? (
                <ol className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                  {lessons.map((lesson) => (
                    <li key={lesson.key}>
                      <Link
                        href={`/learn/${phase.slug}/${lesson.slug}`}
                        className="flex items-center gap-3 px-6 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                      >
                        <LessonStatusIcon lesson={lesson} />
                        <span className="w-10 shrink-0 font-mono text-xs text-zinc-400">
                          {phase.number}.{lesson.order}
                        </span>
                        <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{lesson.title}</span>
                        {lesson.kind === "project" && (
                          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Hammer className="size-3" aria-hidden /> Project
                          </span>
                        )}
                        {lesson.kind === "checkpoint" && (
                          <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                            <Flag className="size-3" aria-hidden /> Test
                          </span>
                        )}
                        <span className="hidden w-16 shrink-0 text-right text-xs text-zinc-500 sm:block">
                          {lesson.minutes} min
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-6 py-4 text-sm text-zinc-500">Lessons for this phase are coming soon.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
