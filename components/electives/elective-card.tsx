import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

import { getLessonMetas } from "@/lib/content";
import type { ElectiveMeta } from "@/lib/types";

/** An elective's entry in a roadmap list, shown after the phase it follows. */
export function ElectiveCard({ elective }: { elective: ElectiveMeta }) {
  const lessons = getLessonMetas(elective.slug);
  return (
    <Link
      href={`/electives/${elective.slug}`}
      className="flex flex-col gap-4 rounded-2xl border border-dashed border-orange-300 bg-orange-50/60 p-5 transition hover:border-orange-500 sm:flex-row sm:items-center dark:border-orange-900 dark:bg-orange-950/20 dark:hover:border-orange-600"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-sm font-bold text-white">
        {elective.code}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-orange-700 uppercase dark:text-orange-300">
            <Sparkles className="size-3" aria-hidden /> Optional elective · {elective.language === "rust" ? "Rust" : "Python"}
          </span>
        </span>
        <span className="mt-0.5 block font-semibold text-zinc-900 dark:text-white">{elective.title}</span>
        <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">{elective.tagline}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-500">
        {lessons.length} lessons · for signed-in learners <ArrowRight className="size-3" aria-hidden />
      </span>
    </Link>
  );
}
