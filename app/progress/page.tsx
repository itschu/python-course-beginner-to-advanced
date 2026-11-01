import type { Metadata } from "next";

import { AccountCard } from "@/components/auth/account-card";
import { courseAccent } from "@/components/course/course-badge";
import { getCourses, getElectives, getLessonMetas } from "@/lib/content";
import { ProgressDashboard } from "./progress-dashboard";

export const metadata: Metadata = {
  title: "My progress",
};

export default function ProgressPage() {
  const courses = getCourses().map((c) => ({
    slug: c.slug,
    title: c.title,
    href: c.href,
    accent: courseAccent(c),
    phases: c.phases.map((p) => ({
      slug: p.slug,
      number: p.number,
      title: p.title,
      href: `${c.href}/${p.slug}`,
      lessons: getLessonMetas(p.slug),
    })),
  }));
  const electives = getElectives().map((e) => ({
    slug: e.slug,
    code: e.code,
    title: e.title,
    lessons: getLessonMetas(e.slug),
  }));
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">My progress</h1>
      <p className="mt-2 mb-8 text-zinc-600 dark:text-zinc-400">
        Lessons, exercises and quiz scores across every course.
      </p>
      <ProgressDashboard courses={courses} electives={electives} account={<AccountCard />} />
    </div>
  );
}
