import { Clock, ExternalLink, Flag, Hammer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LessonBody } from "@/components/lesson/lesson-body";
import { LessonComplete } from "@/components/lesson/lesson-complete";
import { LessonStatusIcon } from "@/components/lesson/lesson-status";
import { PythonWarmup } from "@/components/python/python-warmup";
import { RunnerStatus } from "@/components/python/runner-status";
import { getAdjacentLessons, getLesson, getLessonMetas, getPhase, getPhases } from "@/lib/content";
import { colabUrl } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPhases().flatMap((p) => getLessonMetas(p.slug).map((l) => ({ phase: p.slug, lesson: l.slug })));
}

export async function generateMetadata({ params }: PageProps<"/learn/[phase]/[lesson]">): Promise<Metadata> {
  const { phase, lesson } = await params;
  const meta = getLessonMetas(phase).find((l) => l.slug === lesson);
  return meta ? { title: meta.title, description: meta.summary } : {};
}

export default async function LessonPage({ params }: PageProps<"/learn/[phase]/[lesson]">) {
  const { phase: phaseSlug, lesson: lessonSlug } = await params;
  const phase = getPhase(phaseSlug);
  const lesson = await getLesson(phaseSlug, lessonSlug);
  if (!phase || !lesson) notFound();

  const siblings = getLessonMetas(phase.slug);
  const { prev, next } = getAdjacentLessons(lesson.key);
  const hasCode = lesson.blocks.some((b) => b.type === "code" || b.type === "exercise");
  const href = (l: { phaseSlug: string; slug: string }) => `/learn/${l.phaseSlug}/${l.slug}`;

  return (
    <div className="mx-auto flex max-w-7xl gap-10 px-4 py-10">
      {hasCode && <PythonWarmup />}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-8">
          <Link href={`/learn/${phase.slug}`} className="text-xs font-semibold tracking-wide text-blue-600 uppercase hover:underline dark:text-blue-400">
            Phase {phase.number}
          </Link>
          <div className="mt-1 mb-4 font-semibold text-zinc-900 dark:text-white">{phase.title}</div>
          <ol className="space-y-0.5">
            {siblings.map((l) => (
              <li key={l.key}>
                <Link
                  href={href(l)}
                  aria-current={l.key === lesson.key ? "page" : undefined}
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                    l.key === lesson.key
                      ? "bg-blue-50 font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <LessonStatusIcon lesson={l} className="mt-0.5 size-4 shrink-0" />
                  <span>{l.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <article className="min-w-0 flex-1">
        <div className="mx-auto max-w-3xl">
          <nav className="flex flex-wrap items-center gap-x-2 text-sm text-zinc-500">
            <Link href="/learn" className="hover:underline">
              Course
            </Link>
            <span>/</span>
            <Link href={`/learn/${phase.slug}`} className="hover:underline">
              Phase {phase.number}: {phase.title}
            </Link>
          </nav>
          <header className="mt-4 mb-8 border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-zinc-400">
                {phase.number}.{lesson.order}
              </span>
              {lesson.kind === "project" && (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <Hammer className="size-3" aria-hidden /> Project
                </span>
              )}
              {lesson.kind === "checkpoint" && (
                <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                  <Flag className="size-3" aria-hidden /> Checkpoint test
                </span>
              )}
              <span className="flex items-center gap-1 text-zinc-500">
                <Clock className="size-3.5" aria-hidden /> {lesson.minutes} min
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">{lesson.title}</h1>
            {lesson.summary && <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{lesson.summary}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {hasCode && <RunnerStatus />}
              {lesson.colab && (
                <a href={colabUrl(lesson.colab)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">
                  Open notebook in Colab <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </div>
          </header>

          <LessonBody blocks={lesson.blocks} lessonKey={lesson.key} />

          <LessonComplete
            lesson={lesson}
            nextHref={next ? href(next) : undefined}
            nextTitle={next?.title}
          />

          <nav className="mt-8 flex justify-between gap-4 text-sm">
            {prev ? (
              <Link href={href(prev)} className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                ← {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={href(next)} className="text-right text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                {next.title} →
              </Link>
            )}
          </nav>
        </div>
      </article>
    </div>
  );
}
