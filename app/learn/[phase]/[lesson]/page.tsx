import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LessonView } from "@/components/lesson/lesson-view";
import { getAdjacentLessons, getLesson, getLessonMetas, getPhase, getPhases } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPhases().flatMap((p) => getLessonMetas(p.slug).map((l) => ({ phase: p.slug, lesson: l.slug })));
}

export async function generateMetadata({ params }: PageProps<"/learn/[phase]/[lesson]">): Promise<Metadata> {
  const { phase, lesson } = await params;
  const meta = getLessonMetas(phase).find((l) => l.slug === lesson);
  return meta ? { title: meta.title, description: meta.summary } : {};
}

export default async function LessonPage({ params }: PageProps<"/learn/[phase]/[lesson]">) {
  const { phase: phaseSlug, lesson: lessonSlug } = await params;
  const phase = getPhase(phaseSlug);
  const lesson = await getLesson(phaseSlug, lessonSlug);
  if (!phase || !lesson) notFound();

  const { prev, next } = getAdjacentLessons(lesson.key);
  return (
    <LessonView
      section={{ label: `Phase ${phase.number}`, title: phase.title, href: `/learn/${phase.slug}`, number: String(phase.number) }}
      lesson={lesson}
      siblings={getLessonMetas(phase.slug)}
      prev={prev}
      next={next}
      blocks={lesson.blocks}
    />
  );
}
