"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { useProgress } from "@/components/progress/progress-provider";

export interface CourseLesson {
  key: string;
  title: string;
  href: string;
  phaseTitle: string;
}

/** Points the learner at the first unfinished lesson after the furthest one they've touched. */
export function ContinueCard({ lessons }: { lessons: CourseLesson[] }) {
  const { data, hydrated } = useProgress();
  if (!hydrated || lessons.length === 0) return null;

  let lastTouched = -1;
  lessons.forEach((l, i) => {
    if (data[l.key]) lastTouched = i;
  });
  if (lastTouched === -1) return null;

  const next =
    lessons.slice(0, lastTouched + 1).find((l) => data[l.key] && !data[l.key].completed) ??
    lessons.slice(lastTouched + 1).find((l) => !data[l.key]?.completed) ??
    lessons.find((l) => !data[l.key]?.completed);
  const done = lessons.filter((l) => data[l.key]?.completed).length;

  return (
    <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <div className="text-xs font-semibold tracking-wide text-blue-600 uppercase dark:text-blue-400">
          Welcome back · {done}/{lessons.length} lessons complete
        </div>
        <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {next ? next.title : "You've completed the whole course. Congratulations!"}
        </div>
        {next && <div className="text-sm text-zinc-500 dark:text-zinc-400">{next.phaseTitle}</div>}
      </div>
      {next && (
        <Link href={next.href} className="btn btn-primary">
          Continue <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
