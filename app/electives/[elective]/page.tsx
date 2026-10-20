import { CheckCircle, Flag, Hammer, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ElectiveLockedPanel, LeaveElectiveButton } from "@/components/electives/elective-access-panel";
import { CompletionBar, LessonStatusIcon } from "@/components/lesson/lesson-status";
import { ResourceGrid } from "@/components/resource-list";
import { getElective, getLessonMetas, getPhases } from "@/lib/content";
import { electiveAccess, isUnlocked } from "@/lib/electives";

export async function generateMetadata({ params }: PageProps<"/electives/[elective]">): Promise<Metadata> {
  const { elective: slug } = await params;
  const elective = getElective(slug);
  return elective ? { title: `Elective: ${elective.title}`, description: elective.tagline } : {};
}

export default async function ElectivePage({ params }: PageProps<"/electives/[elective]">) {
  const { elective: slug } = await params;
  const elective = getElective(slug);
  if (!elective) notFound();
  const access = await electiveAccess(elective.slug);
  const unlocked = isUnlocked(access);
  const lessons = getLessonMetas(elective.slug);
  const after = getPhases().find((p) => p.number === elective.after);
  const href = `/electives/${elective.slug}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <nav className="text-sm text-zinc-500">
        <Link href="/learn" className="hover:underline">
          Course
        </Link>{" "}
        / Elective {elective.code}
      </nav>
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-2xl font-bold text-white">
          {elective.code}
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
              Optional elective
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {elective.language === "rust" ? "Rust only" : "Python only"}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{elective.title}</h1>
          <p className="mt-1 text-lg text-zinc-600 dark:text-zinc-400">{elective.tagline}</p>
          <p className="mt-4 text-zinc-700 dark:text-zinc-300">{elective.description}</p>
          <p className="mt-2 text-sm text-zinc-500">
            Suggested pace: {elective.weeks}.
            {after && (
              <>
                {" "}
                Take it after{" "}
                <Link href={`/learn/${after.slug}`} className="text-blue-600 hover:underline dark:text-blue-400">
                  Phase {after.number}: {after.title}
                </Link>
                ; it builds on that phase and the ones before it.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-8">
        {unlocked ? (
          access === "enrolled" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <span className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                <CheckCircle className="size-4" aria-hidden /> You&apos;re taking this elective.
              </span>
              <LeaveElectiveButton slug={elective.slug} />
            </div>
          )
        ) : (
          <ElectiveLockedPanel slug={elective.slug} title={elective.title} access={access} returnTo={href} />
        )}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Lessons</h2>
            {unlocked && lessons.length > 0 && (
              <div className="w-48">
                <CompletionBar lessons={lessons} />
              </div>
            )}
          </div>
          <ol className="card divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800/70">
            {lessons.map((lesson) => (
              <li key={lesson.key}>
                <Link href={`${href}/${lesson.slug}`} className="flex items-start gap-3 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  {unlocked ? (
                    <LessonStatusIcon lesson={lesson} className="mt-0.5 size-5" />
                  ) : (
                    <Lock className="mt-0.5 size-5 text-zinc-400" aria-label="Locked" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-zinc-400">
                        {elective.code}.{lesson.order}
                      </span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{lesson.title}</span>
                      {lesson.kind === "project" && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          <Hammer className="size-3" aria-hidden /> Project
                        </span>
                      )}
                      {lesson.kind === "checkpoint" && (
                        <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                          <Flag className="size-3" aria-hidden /> Checkpoint test
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{lesson.summary}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {lesson.minutes} min
                      {lesson.exerciseIds.length > 0 && ` · ${lesson.exerciseIds.length} exercises`}
                      {lesson.quizIds.length > 0 && ` · ${lesson.quizIds.length} quiz`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <aside>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">By the end you&apos;ll be able to</h2>
          <ul className="space-y-2">
            {elective.outcomes.map((o) => (
              <li key={o} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                {o}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <section className="mt-14">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Resources for this elective</h2>
        <p className="mt-1 mb-5 text-sm text-zinc-600 dark:text-zinc-400">
          Use these alongside the lessons for a second explanation, or to go deeper.
        </p>
        <ResourceGrid resources={elective.resources} />
      </section>
    </div>
  );
}
