import { CheckCircle, Flag, Hammer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompletionBar, LessonStatusIcon } from "@/components/lesson/lesson-status";
import { ResourceGrid } from "@/components/resource-list";
import { getLessonMetas, getPhase, getPhases } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPhases().map((p) => ({ phase: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/learn/[phase]">): Promise<Metadata> {
  const { phase: slug } = await params;
  const phase = getPhase(slug);
  return phase ? { title: `Phase ${phase.number}: ${phase.title}`, description: phase.tagline } : {};
}

export default async function PhasePage({ params }: PageProps<"/learn/[phase]">) {
  const { phase: slug } = await params;
  const phase = getPhase(slug);
  if (!phase) notFound();
  const lessons = getLessonMetas(phase.slug);
  const phases = getPhases();
  const next = phases.find((p) => p.number === phase.number + 1);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <nav className="text-sm text-zinc-500">
        <Link href="/learn" className="hover:underline">
          Course
        </Link>{" "}
        / Phase {phase.number}
      </nav>
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-3xl font-bold text-white">
          {phase.number}
        </span>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{phase.title}</h1>
          <p className="mt-1 text-lg text-zinc-600 dark:text-zinc-400">{phase.tagline}</p>
          <p className="mt-4 text-zinc-700 dark:text-zinc-300">{phase.description}</p>
          <p className="mt-2 text-sm text-zinc-500">Suggested pace: {phase.weeks}</p>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Lessons</h2>
            {lessons.length > 0 && (
              <div className="w-48">
                <CompletionBar lessons={lessons} />
              </div>
            )}
          </div>
          {lessons.length === 0 ? (
            <p className="card p-6 text-sm text-zinc-500">Lessons for this phase are coming soon.</p>
          ) : (
            <ol className="card divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800/70">
              {lessons.map((lesson) => (
                <li key={lesson.key}>
                  <Link
                    href={`/learn/${phase.slug}/${lesson.slug}`}
                    className="flex items-start gap-3 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  >
                    <LessonStatusIcon lesson={lesson} className="mt-0.5 size-5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-zinc-400">
                          {phase.number}.{lesson.order}
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
          )}
          {next && (
            <Link href={`/learn/${next.slug}`} className="mt-6 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
              Next phase: {next.title} →
            </Link>
          )}
        </section>

        <aside>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">By the end you&apos;ll be able to</h2>
          <ul className="space-y-2">
            {phase.outcomes.map((o) => (
              <li key={o} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                {o}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <section className="mt-14">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Resources for this phase</h2>
        <p className="mt-1 mb-5 text-sm text-zinc-600 dark:text-zinc-400">
          Use these alongside the lessons for a second explanation, extra practice, or to go deeper.
        </p>
        <ResourceGrid resources={phase.resources} />
      </section>
    </div>
  );
}
