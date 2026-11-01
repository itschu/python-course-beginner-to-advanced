import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LessonView } from "@/components/lesson/lesson-view";
import { getAdjacentLessons, getLesson, getLessonMetas, getPhase, getPhases } from "@/lib/content";
import type { CourseMeta } from "@/lib/types";

/** Static params, metadata and page for <course.href>/[phase]/[lesson]. */
export function lessonParams(course: CourseMeta) {
  return getPhases(course).flatMap((p) => getLessonMetas(p.slug).map((l) => ({ phase: p.slug, lesson: l.slug })));
}

export function lessonMetadata(course: CourseMeta, phase: string, lesson: string): Metadata {
  if (!getPhase(phase, course)) return {};
  const meta = getLessonMetas(phase).find((l) => l.slug === lesson);
  return meta ? { title: meta.title, description: meta.summary } : {};
}

export async function CourseLessonPage({ course, phaseSlug, lessonSlug }: { course: CourseMeta; phaseSlug: string; lessonSlug: string }) {
  const phase = getPhase(phaseSlug, course);
  const lesson = phase ? await getLesson(phaseSlug, lessonSlug) : null;
  if (!phase || !lesson) notFound();

  const { prev, next } = getAdjacentLessons(lesson.key);
  return (
    <LessonView
      section={{
        label: `Phase ${phase.number}`,
        title: phase.title,
        href: `${course.href}/${phase.slug}`,
        number: String(phase.number),
        course: { shortTitle: course.shortTitle, href: course.href },
      }}
      lesson={lesson}
      siblings={getLessonMetas(phase.slug)}
      prev={prev}
      next={next}
      blocks={lesson.blocks}
    />
  );
}
