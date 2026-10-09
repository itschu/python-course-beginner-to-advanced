import { ArrowRight, Code2, FlaskConical, Hammer, Rocket, Server } from "lucide-react";
import Link from "next/link";

import { ContinueCard } from "@/components/continue-card";
import { CompletionBar } from "@/components/lesson/lesson-status";
import { getAllLessonMetas, getCourseStats, getLessonMetas, getPhases } from "@/lib/content";

const STEPS = [
  {
    icon: Code2,
    title: "Read & run",
    text: "Short explanations with real code you can edit and run instantly. Python runs in your browser; there's nothing to install.",
  },
  {
    icon: FlaskConical,
    title: "Get tested",
    text: "Every lesson has exercises checked by automatic tests, plus quizzes. You know straight away whether you've got it.",
  },
  {
    icon: Hammer,
    title: "Build projects",
    text: "Each phase ends with a project and a checkpoint test, building towards your own value-betting model.",
  },
  {
    icon: Server,
    title: "Ship it",
    text: "Learn FastAPI to serve your models as APIs: the backend skills that turn a notebook into a product.",
  },
];

export default function HomePage() {
  const phases = getPhases();
  const stats = getCourseStats();
  const all = getAllLessonMetas();
  const firstLesson = all[0];
  const courseLessons = all.map((l) => ({
    key: l.key,
    title: l.title,
    href: `/learn/${l.phaseSlug}/${l.slug}`,
    phaseTitle: `Phase ${phases.find((p) => p.slug === l.phaseSlug)?.number}: ${phases.find((p) => p.slug === l.phaseSlug)?.title}`,
  }));

  return (
    <div>
      <section className="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.12),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.25),transparent_60%)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-5xl px-4 pt-16 pb-14 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            Free · runs in your browser · beginner to professional
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-zinc-900 sm:text-6xl dark:text-white">
            Learn Python.
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
              Build your own ML models.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            A complete path from your first <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-base dark:bg-zinc-800">print(&quot;hello&quot;)</code> to
            training, evaluating and serving machine learning models with a Python backend. Every lesson has code to run,
            exercises with automatic tests, and quizzes.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {firstLesson && (
              <Link href={`/learn/${firstLesson.phaseSlug}/${firstLesson.slug}`} className="btn btn-primary px-5 py-2.5 text-base">
                Start lesson 1 <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
            <Link href="/learn" className="btn btn-outline px-5 py-2.5 text-base">
              See the full roadmap
            </Link>
          </div>
          <div className="mx-auto max-w-2xl text-left">
            <ContinueCard lessons={courseLessons} />
          </div>
          <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              [stats.phases, "phases"],
              [stats.lessons, "lessons"],
              [stats.exercises, "tested exercises"],
              [stats.projects + stats.checkpoints, "projects & tests"],
              [`${stats.hours}h+`, "of guided practice"],
            ].map(([value, label]) => (
              <div key={String(label)} className="rounded-xl border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
                <dd className="m-0 text-2xl font-bold text-zinc-900 dark:text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.title} className="card p-5">
              <step.icon className="size-6 text-blue-600 dark:text-blue-400" aria-hidden />
              <h3 className="mt-3 font-semibold text-zinc-900 dark:text-white">{step.title}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50 py-16 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">The roadmap</h2>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            About an hour a day for nine to ten months. Go faster or slower: your progress is saved.
          </p>
          <ol className="mt-8 space-y-3">
            {phases.map((phase) => {
              const lessons = getLessonMetas(phase.slug);
              return (
                <li key={phase.slug}>
                  <Link
                    href={`/learn/${phase.slug}`}
                    className="card flex flex-col gap-4 p-5 transition hover:border-blue-400 sm:flex-row sm:items-center dark:hover:border-blue-500"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
                      {phase.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-3">
                        <span className="font-semibold text-zinc-900 dark:text-white">{phase.title}</span>
                        <span className="text-xs text-zinc-500">{phase.weeks}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">{phase.tagline}</span>
                    </span>
                    <span className="w-full shrink-0 sm:w-40">
                      {lessons.length > 0 ? (
                        <CompletionBar lessons={lessons} />
                      ) : (
                        <span className="text-xs text-zinc-500">Coming soon</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="card flex flex-col gap-6 p-8 sm:flex-row sm:items-center">
          <Rocket className="size-10 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Learning with a goal</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              The projects build towards a football value-betting model, because a concrete goal makes every lesson
              stick. Along the way you&apos;ll also work with housing prices, medical data, images and text, so your
              skills transfer to any ML job. We&apos;re honest about the maths too: you&apos;ll learn why most betting
              and trading models lose money, and how to evaluate yours without fooling yourself.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
