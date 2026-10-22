import { Shield } from "lucide-react";
import Link from "next/link";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
];

export function AdminHeader({ active, title }: { active: string; title: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-violet-700 uppercase dark:text-violet-300">
        <Shield className="size-3.5" aria-hidden /> Admin
      </div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{title}</h1>
      <nav className="mt-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-800" aria-label="Admin">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active === tab.href ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              active === tab.href
                ? "border-violet-600 text-zinc-900 dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-zinc-900 tabular-nums dark:text-white">{value}</div>
      {detail && <div className="mt-1 text-xs text-zinc-500">{detail}</div>}
    </div>
  );
}

export const formatDate = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–";
