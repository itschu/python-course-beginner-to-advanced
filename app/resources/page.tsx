import type { Metadata } from "next";

import { ResourceExplorer } from "@/components/resource-list";
import { toolkit } from "@/content/curriculum";
import { getPhases } from "@/lib/content";

export const metadata: Metadata = {
  title: "Resources",
  description: "Every course, book, video, tool and dataset you need to go from Python beginner to ML professional.",
};

export default function ResourcesPage() {
  const phases = getPhases();
  const groups = [
    {
      id: "toolkit",
      title: "Your toolkit",
      subtitle: "The free tools you'll install or sign up for. You only need the browser for Phase 1.",
      resources: toolkit,
    },
    ...phases.map((p) => ({
      id: p.slug,
      title: `Phase ${p.number}: ${p.title}`,
      subtitle: p.tagline,
      resources: p.resources,
    })),
  ];
  const total = groups.reduce((n, g) => n + g.resources.length, 0);
  const free = groups.reduce((n, g) => n + g.resources.filter((r) => r.free).length, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Resources</h1>
      <p className="mt-3 max-w-3xl text-zinc-600 dark:text-zinc-400">
        {total} hand-picked resources, {free} of them free. You don&apos;t need to use them all: this course is complete on
        its own. Use them when you want a second explanation, more practice, or to go deeper. If you buy just one book per
        phase, pick the one marked as the reference in the phase description.
      </p>
      <div className="mt-8">
        <ResourceExplorer groups={groups} />
      </div>
    </div>
  );
}
