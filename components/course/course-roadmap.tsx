import { Flag, Hammer } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { courseAccent } from "@/components/course/course-badge";
import { ElectiveCard } from "@/components/electives/elective-card";
import { CompletionBar, LessonStatusIcon } from "@/components/lesson/lesson-status";
import { getCourseStats, getLessonMetas } from "@/lib/content";
import type { CourseMeta } from "@/lib/types";

/** A course's roadmap: every phase and its lessons. */
export function CourseRoadmap({ course, title, intro }: { course: CourseMeta; title: string; intro?: ReactNode }) {
  const stats = getCourseStats(course);
  const accent = courseAccent(course);
  const growing = course.phases.some((p) => getLessonMetas(p.slug).length === 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{title}</h1>
      <p className="mt-3 max-w-3xl text-zinc-600 dark:text-zinc-400">
        {stats.phases} phases, {stats.lessons} lessons{growing ? " so far" : ""}, {stats.exercises} tested exercises, {stats.quizzes} quizzes,{" "}
        {stats.projects} {stats.projects === 1 ? "project" : "projects"} and {stats.checkpoints} checkpoint{" "}
        {stats.checkpoints === 1 ? "test" : "tests"}. Work through them in order: each phase builds on the last.
        {course.electives.length > 0 && " Electives are optional extras for signed-in learners."}
      </p>
      {intro}

      <div className="mt-10 space-y-8">
        {course.phases.map((phase) => {
          const lessons = getLessonMetas(phase.slug);
          return (
            <Fragment key={phase.slug}>
              <section className="card overflow-hidden">
                <div className="flex flex-col gap-4 border-b border-zinc-200 p-6 sm:flex-row sm:items-start dark:border-zinc-800">
                  <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white ${accent}`}>
                    {phase.number}
                  </span>
                  <div className="flex-1">
                    <Link href={`${course.href}/${phase.slug}`} className="hover:underline">
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
                          href={`${course.href}/${phase.slug}/${lesson.slug}`}
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
              {course.electives
                .filter((e) => e.after === phase.number)
                .map((elective) => (
                  <ElectiveCard key={elective.slug} elective={elective} />
                ))}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
