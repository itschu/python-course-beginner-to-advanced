import type { Metadata } from "next";

import { AccountCard } from "@/components/auth/account-card";
import { getLessonMetas, getPhases } from "@/lib/content";
import { ProgressDashboard } from "./progress-dashboard";

export const metadata: Metadata = {
  title: "My progress",
};

export default function ProgressPage() {
  const phases = getPhases().map((p) => ({
    slug: p.slug,
    number: p.number,
    title: p.title,
    lessons: getLessonMetas(p.slug),
  }));
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">My progress</h1>
      <p className="mt-2 mb-8 text-zinc-600 dark:text-zinc-400">
        Lessons, exercises and quiz scores across the whole course.
      </p>
      <ProgressDashboard phases={phases} account={<AccountCard />} />
    </div>
  );
}
