import type { Metadata } from "next";

import { ResourceExplorer } from "@/components/resource-list";
import { mainCourse, mobileCourse } from "@/content/courses";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Every course, book, video, tool and dataset you need to go from beginner to professional in Python, Rust, machine learning, embedded systems and mobile apps.",
};

export default function ResourcesPage() {
  const groups = [
    {
      id: "toolkit",
      title: "Your toolkit",
      subtitle: "The free tools you'll install or sign up for. You only need the browser for Phase 1.",
      resources: mainCourse.toolkit,
    },
    ...mainCourse.phases.map((p) => ({
      id: p.slug,
      title: `Phase ${p.number}: ${p.title}`,
      subtitle: p.tagline,
      resources: p.resources,
    })),
    {
      id: "mobile-toolkit",
      title: `${mobileCourse.title}: your toolkit`,
      subtitle: "Phase 1 only needs the browser. Install Expo Go on your phone to run the examples there.",
      resources: mobileCourse.toolkit,
    },
    ...mobileCourse.phases.map((p) => ({
      id: p.slug,
      title: `Mobile phase ${p.number}: ${p.title}`,
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
        {total} hand-picked resources, {free} of them free, for both courses. You don&apos;t need to use them all: each
        course is complete on its own. Use them when you want a second explanation, more practice, or to go deeper. If you
        buy just one book per phase, pick the one marked as the reference in the phase description.
      </p>
      <p className="mt-3 text-sm">
        Jump to:{" "}
        <a href="#toolkit" className="text-blue-700 hover:underline dark:text-blue-400">
          {mainCourse.shortTitle}
        </a>{" "}
        ·{" "}
        <a href="#mobile-toolkit" className="text-blue-700 hover:underline dark:text-blue-400">
          {mobileCourse.shortTitle}
        </a>
      </p>
      <div className="mt-8">
        <ResourceExplorer groups={groups} />
      </div>
    </div>
  );
}
