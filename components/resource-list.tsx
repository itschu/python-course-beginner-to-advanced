"use client";

import { BookOpen, ExternalLink, FileText, GraduationCap, PlayCircle, Target, Wrench } from "lucide-react";
import { useState } from "react";

import type { Resource, ResourceType } from "@/lib/types";

const TYPE_META: Record<ResourceType, { label: string; icon: typeof BookOpen }> = {
  course: { label: "Course", icon: GraduationCap },
  book: { label: "Book", icon: BookOpen },
  video: { label: "Video", icon: PlayCircle },
  docs: { label: "Docs", icon: FileText },
  tool: { label: "Tool", icon: Wrench },
  practice: { label: "Practice", icon: Target },
  article: { label: "Article", icon: FileText },
};

export function ResourceCard({ resource }: { resource: Resource }) {
  const meta = TYPE_META[resource.type];
  const Icon = meta.icon;
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-blue-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-500"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-medium text-zinc-900 group-hover:text-blue-700 dark:text-zinc-100 dark:group-hover:text-blue-400">
            {resource.title}
          </span>
          <ExternalLink className="mt-1 size-3.5 shrink-0 text-zinc-400" aria-hidden />
        </span>
        <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">{resource.note}</span>
        <span className="mt-2 flex gap-1.5">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {meta.label}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              resource.free
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {resource.free ? "Free" : "Paid"}
          </span>
        </span>
      </span>
    </a>
  );
}

export function ResourceGrid({ resources }: { resources: Resource[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {resources.map((r) => (
        <ResourceCard key={r.url} resource={r} />
      ))}
    </div>
  );
}

interface Group {
  id: string;
  title: string;
  subtitle?: string;
  resources: Resource[];
}

export function ResourceExplorer({ groups }: { groups: Group[] }) {
  const [freeOnly, setFreeOnly] = useState(false);
  const [type, setType] = useState<ResourceType | "all">("all");
  const types = Object.keys(TYPE_META) as ResourceType[];
  const filter = (r: Resource) => (!freeOnly || r.free) && (type === "all" || r.type === type);

  return (
    <div>
      <div className="sticky top-14 z-10 -mx-4 mb-8 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <button
          type="button"
          onClick={() => setType("all")}
          className={`btn btn-sm ${type === "all" ? "btn-primary" : "btn-outline"}`}
        >
          All types
        </button>
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`btn btn-sm ${type === t ? "btn-primary" : "btn-outline"}`}
          >
            {TYPE_META[t].label}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => setFreeOnly(e.target.checked)}
            className="size-4 accent-blue-600"
          />
          Free only
        </label>
      </div>
      <div className="space-y-12">
        {groups.map((g) => {
          const items = g.resources.filter(filter);
          if (items.length === 0) return null;
          return (
            <section key={g.id} id={g.id} className="scroll-mt-32">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{g.title}</h2>
              {g.subtitle && <p className="mt-1 mb-4 text-sm text-zinc-600 dark:text-zinc-400">{g.subtitle}</p>}
              <ResourceGrid resources={items} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
