import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminHeader, formatDate } from "@/components/admin/admin-header";
import { requireAdminPage } from "@/lib/admin";
import { listUsers } from "@/lib/admin-data";
import { getElectives } from "@/lib/content";

export const metadata: Metadata = { title: "Users · Admin", robots: { index: false } };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireAdminPage("/admin/users");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number(params.page) || 1);
  const { users, total, pageSize } = await listUsers(q, page);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const codes = new Map(getElectives().map((e) => [e.slug, e.code]));
  const pageHref = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <AdminHeader active="/admin/users" title="Users" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action="/admin/users" className="flex flex-1 gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name or email"
            aria-label="Search users"
            className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button type="submit" className="btn btn-sm btn-outline">
            Search
          </button>
        </form>
        <a href="/api/admin/users/export" download className="btn btn-sm btn-outline">
          <Download className="size-4" aria-hidden /> Export CSV
        </a>
      </div>

      <p className="mb-3 text-sm text-zinc-500">
        {total} {total === 1 ? "account" : "accounts"}
        {q && <> matching &ldquo;{q}&rdquo;</>}
      </p>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-4 py-2 font-medium">Learner</th>
              <th className="px-4 py-2 font-medium">Joined</th>
              <th className="px-4 py-2 font-medium">Last active</th>
              <th className="px-4 py-2 text-right font-medium">Lessons</th>
              <th className="px-4 py-2 text-right font-medium">Exercises</th>
              <th className="px-4 py-2 font-medium">Electives</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                  No accounts found.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                <td className="px-4 py-2">
                  <Link href={`/admin/users/${encodeURIComponent(u.id)}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                    {u.name || "(no name)"}
                  </Link>
                  <div className="text-xs text-zinc-500">{u.email}</div>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{formatDate(u.lastActive)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{u.lessonsCompleted}</td>
                <td className="px-4 py-2 text-right tabular-nums">{u.exercisesPassed}</td>
                <td className="px-4 py-2 text-xs">{u.electives.map((slug) => codes.get(slug) ?? slug).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
          {page > 1 ? <Link href={pageHref(page - 1)} className="hover:underline">← Newer</Link> : <span />}
          <span className="text-zinc-500">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={pageHref(page + 1)} className="hover:underline">Older →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
