import { ArrowRight, MonitorSmartphone, Smartphone, TestTube2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ContinueCard } from "@/components/continue-card";
import { CourseRoadmap } from "@/components/course/course-roadmap";
import { mobileCourse } from "@/content/courses";
import { getAllLessonMetas } from "@/lib/content";

export const metadata: Metadata = {
  title: "Mobile Apps with React Native",
  description: mobileCourse.tagline,
};

const HOW = [
  {
    icon: MonitorSmartphone,
    title: "A phone in your browser",
    text: "Every example runs in a React Native simulator on the page. Tap the buttons and type into the inputs: it's a live app.",
  },
  {
    icon: Smartphone,
    title: "Then on your own phone",
    text: "Open any example in Expo Snack and scan the QR code with Expo Go to run it on your iPhone or Android phone. No Mac or Xcode needed.",
  },
  {
    icon: TestTube2,
    title: "Tested like a real team",
    text: "Exercises are checked with Jest and React Native Testing Library, the same tools professional React Native teams use.",
  },
];

export default function MobileCoursePage() {
  const course = mobileCourse;
  const phases = course.phases;
  const lessons = getAllLessonMetas(course).map((l) => {
    const phase = phases.find((p) => p.slug === l.phaseSlug)!;
    return { key: l.key, title: l.title, href: `${course.href}/${l.phaseSlug}/${l.slug}`, phaseTitle: `Phase ${phase.number}: ${phase.title}` };
  });
  const first = lessons[0];

  return (
    <>
      <section className="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.12),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.25),transparent_60%)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-5xl px-4 pt-14 pb-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <span className="size-1.5 rounded-full bg-violet-500" aria-hidden />
            A second course · free · iOS and Android
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-white">{course.title}</h1>
          <p className="mt-4 max-w-3xl text-lg text-zinc-600 dark:text-zinc-400">{course.description}</p>
          <p className="mt-3 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Before you start: </span>
            {course.prerequisites}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {first && (
              <Link href={first.href} className="btn btn-primary px-5 py-2.5 text-base">
                Start lesson 1 <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
            <Link href="/resources#mobile-toolkit" className="btn btn-outline px-5 py-2.5 text-base">
              Tools you&apos;ll use
            </Link>
          </div>
          <div className="max-w-2xl">
            <ContinueCard lessons={lessons} />
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {HOW.map((item) => (
              <div key={item.title} className="card p-5">
                <item.icon className="size-6 text-violet-600 dark:text-violet-400" aria-hidden />
                <h2 className="mt-3 font-semibold text-zinc-900 dark:text-white">{item.title}</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <CourseRoadmap course={course} title="Roadmap" />
    </>
  );
}
