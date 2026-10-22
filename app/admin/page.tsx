import type { Metadata } from "next";
import Link from "next/link";

import { AdminHeader, StatCard } from "@/components/admin/admin-header";
import { requireAdminPage } from "@/lib/admin";
import { getLessonActivity, getOverview, getSectionLearners } from "@/lib/admin-data";
import { getElectives, getLessonMetas, getPhases } from "@/lib/content";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage() {
  await requireAdminPage("/admin");
  const [overview, activity, learners] = await Promise.all([getOverview(), getLessonActivity(), getSectionLearners()]);

  const sections = [
    ...getPhases().map((p) => ({ slug: p.slug, label: `Phase ${p.number}`, title: p.title, href: `/learn/${p.slug}` })),
    ...getElectives().map((e) => ({ slug: e.slug, label: `Elective ${e.code}`, title: e.title, href: `/electives/${e.slug}` })),
  ].map((s) => {
    const lessons = getLessonMetas(s.slug);
    const completions = lessons.reduce((n, l) => n + (activity.get(l.key)?.completed ?? 0), 0);
    return { ...s, lessons: lessons.length, learners: learners.get(s.slug) ?? 0, completions };
  });

  const titles = new Map(
    [...getPhases(), ...getElectives()].flatMap((s) => getLessonMetas(s.slug).map((l) => [l.key, l.title] as const)),
  );
  const topLessons = [...activity.entries()]
    .filter(([key]) => titles.has(key))
    .sort((a, b) => b[1].started - a[1].started)
    .slice(0, 10);
  const maxWeek = Math.max(1, ...overview.signupsByWeek.map((w) => w.count));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <AdminHeader active="/admin" title="Overview" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Accounts" value={overview.users} detail={`${overview.newLast7} new this week, ${overview.newLast30} in 30 days`} />
        <StatCard label="Active learners" value={overview.activeLast7} detail={`last 7 days (${overview.activeLast30} in 30 days)`} />
        <StatCard label="Lessons completed" value={overview.lessonsCompleted} detail="by signed-in learners" />
        <StatCard label="Exercises passed" value={overview.exercisesPassed} detail="by signed-in learners" />
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Only signed-in learners are counted: progress made without an account stays in that person&apos;s browser.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">Phases and electives</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-4 py-2 font-medium">Section</th>
                  <th className="px-4 py-2 text-right font-medium">Lessons</th>
                  <th className="px-4 py-2 text-right font-medium">Learners</th>
                  <th className="px-4 py-2 text-right font-medium">Completions</th>
                  {getElectives().length > 0 && <th className="px-4 py-2 text-right font-medium">Enrolled</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {sections.map((s) => (
                  <tr key={s.slug}>
                    <td className="px-4 py-2">
                      <Link href={s.href} className="hover:underline">
                        <span className="font-mono text-xs text-zinc-400">{s.label}</span>{" "}
                        <span className="text-zinc-900 dark:text-zinc-100">{s.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.lessons}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.learners}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.completions}</td>
                    {getElectives().length > 0 && (
                      <td className="px-4 py-2 text-right tabular-nums">{overview.enrolments[s.slug] ?? ""}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">Sign-ups per week</h2>
            <div className="card p-4">
              {overview.signupsByWeek.length === 0 ? (
                <p className="text-sm text-zinc-500">No sign-ups in the last 12 weeks.</p>
              ) : (
                <ul className="space-y-1.5">
                  {overview.signupsByWeek.map((w) => (
                    <li key={w.week} className="flex items-center gap-2 text-xs">
                      <span className="w-20 shrink-0 text-zinc-500 tabular-nums">{w.week}</span>
                      <span className="flex-1">
                        <span className="block h-3 rounded bg-violet-500" style={{ width: `${(w.count / maxWeek) * 100}%` }} />
                      </span>
                      <span className="w-8 shrink-0 text-right tabular-nums">{w.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">Most started lessons</h2>
            <ol className="card divide-y divide-zinc-100 text-sm dark:divide-zinc-800/70">
              {topLessons.length === 0 && <li className="p-4 text-zinc-500">No progress yet.</li>}
              {topLessons.map(([key, a]) => (
                <li key={key} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0 truncate">{titles.get(key)}</span>
                  <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
                    {a.started} started · {a.completed} done
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
