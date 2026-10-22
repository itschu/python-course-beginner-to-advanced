import { CheckCircle2, CircleDot } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminHeader, StatCard, formatDate } from "@/components/admin/admin-header";
import { DeleteUserButton, ElectiveToggle } from "@/components/admin/user-actions";
import { ProgressBar } from "@/components/lesson/lesson-status";
import { requireAdminPage } from "@/lib/admin";
import { getUser } from "@/lib/admin-data";
import { getElectives, getLessonMetas, getPhases } from "@/lib/content";

export const metadata: Metadata = { title: "Learner · Admin", robots: { index: false } };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const session = await requireAdminPage(`/admin/users/${encodeURIComponent(id)}`);
  const user = await getUser(id);
  if (!user) notFound();

  const progress = new Map(user.lessons.map((l) => [l.key, l]));
  const sections = [
    ...getPhases().map((p) => ({ slug: p.slug, label: `Phase ${p.number}`, title: p.title })),
    ...getElectives().map((e) => ({ slug: e.slug, label: `Elective ${e.code}`, title: e.title })),
  ].map((s) => {
    const lessons = getLessonMetas(s.slug);
    return { ...s, total: lessons.length, done: lessons.filter((l) => progress.get(l.key)?.completed).length };
  });
  const titles = new Map(
    [...getPhases(), ...getElectives()].flatMap((s) => getLessonMetas(s.slug).map((l) => [l.key, l.title] as const)),
  );
  const enrolled = new Set(user.electives.map((e) => e.slug));
  const completed = user.lessons.filter((l) => l.completed).length;
  const exercises = user.lessons.reduce((n, l) => n + l.exercisesPassed, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <AdminHeader active="/admin/users" title={user.name || user.email} />
      <nav className="-mt-4 mb-6 text-sm text-zinc-500">
        <Link href="/admin/users" className="hover:underline">
          ← All users
        </Link>
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lessons completed" value={completed} detail={`${user.lessons.length} started`} />
        <StatCard label="Exercises passed" value={exercises} />
        <StatCard label="Joined" value={formatDate(user.createdAt)} />
        <StatCard label="Last active" value={formatDate(user.lessons[0]?.updatedAt ?? user.lastSession)} />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">Progress</h2>
          <div className="card divide-y divide-zinc-100 dark:divide-zinc-800/70">
            {sections.map((s) => (
              <div key={s.slug} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-mono text-xs text-zinc-400">{s.label}</span> {s.title}
                </div>
                <div className="flex w-full items-center gap-3 sm:w-56">
                  <ProgressBar percent={s.total ? (s.done / s.total) * 100 : 0} />
                  <span className="w-12 shrink-0 text-right text-xs text-zinc-500 tabular-nums">
                    {s.done}/{s.total}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <h2 className="mt-8 mb-3 text-lg font-semibold text-zinc-900 dark:text-white">Recent activity</h2>
          <ol className="card divide-y divide-zinc-100 text-sm dark:divide-zinc-800/70">
            {user.lessons.length === 0 && <li className="p-4 text-zinc-500">No progress saved to this account yet.</li>}
            {user.lessons.slice(0, 15).map((l) => (
              <li key={l.key} className="flex items-center gap-3 px-4 py-2">
                {l.completed ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-label="Completed" />
                ) : (
                  <CircleDot className="size-4 shrink-0 text-blue-600" aria-label="In progress" />
                )}
                <span className="min-w-0 flex-1 truncate">{titles.get(l.key) ?? l.key}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {l.exercisesPassed > 0 && `${l.exercisesPassed} ${l.exercisesPassed === 1 ? "exercise" : "exercises"} · `}
                  {formatDate(l.updatedAt)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-8">
          <section className="card p-5 text-sm">
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">Account</h2>
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-zinc-500">Email</dt>
                <dd className="m-0 break-all">
                  {user.email}{" "}
                  <span className="text-xs text-zinc-500">({user.emailVerified ? "verified" : "not verified"})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Signs in with</dt>
                <dd className="m-0">
                  {user.providers.map((p) => (p === "credential" ? "email and password" : p)).join(", ") || "–"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">User ID</dt>
                <dd className="m-0 font-mono text-xs break-all">{user.id}</dd>
              </div>
            </dl>
          </section>

          {getElectives().length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">Electives</h2>
              <ul className="card divide-y divide-zinc-100 text-sm dark:divide-zinc-800/70">
                {getElectives().map((e) => (
                  <li key={e.slug} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-zinc-400">{e.code}</span> {e.title}
                      <span className="block text-xs text-zinc-500">
                        {enrolled.has(e.slug)
                          ? `Enrolled ${formatDate(user.electives.find((x) => x.slug === e.slug)!.enrolledAt)}`
                          : "Not enrolled"}
                      </span>
                    </span>
                    <ElectiveToggle userId={user.id} slug={e.slug} enrolled={enrolled.has(e.slug)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {user.id !== session.user.id && (
            <section className="rounded-xl border border-rose-200 p-5 dark:border-rose-900">
              <h2 className="mb-1 text-lg font-semibold text-rose-700 dark:text-rose-400">Delete account</h2>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                Removes the account, its sign-ins, progress, saved code and electives. Use this for deletion requests.
                It can&apos;t be undone.
              </p>
              <DeleteUserButton userId={user.id} email={user.email} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
