import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ElectiveLockedPanel } from "@/components/electives/elective-access-panel";
import { LessonView } from "@/components/lesson/lesson-view";
import { getAdjacentLessons, getElective, getLesson, getLessonMetas } from "@/lib/content";
import { electiveAccess, isUnlocked } from "@/lib/electives";

export async function generateMetadata({ params }: PageProps<"/electives/[elective]/[lesson]">): Promise<Metadata> {
  const { elective, lesson } = await params;
  const meta = getElective(elective) && getLessonMetas(elective).find((l) => l.slug === lesson);
  return meta ? { title: meta.title, description: meta.summary } : {};
}

export default async function ElectiveLessonPage({ params }: PageProps<"/electives/[elective]/[lesson]">) {
  const { elective: electiveSlug, lesson: lessonSlug } = await params;
  const elective = getElective(electiveSlug);
  const siblings = elective ? getLessonMetas(elective.slug) : [];
  const meta = siblings.find((l) => l.slug === lessonSlug);
  if (!elective || !meta) notFound();

  const access = await electiveAccess(elective.slug);
  // Locked visitors get the lesson's title and summary only: the content is never sent.
  const lesson = isUnlocked(access) ? await getLesson(elective.slug, lessonSlug) : null;
  const { prev, next } = getAdjacentLessons(meta.key);
  const href = `/electives/${elective.slug}`;

  return (
    <LessonView
      section={{ label: `Elective ${elective.code}`, title: elective.title, href, number: elective.code }}
      lesson={lesson ?? meta}
      siblings={siblings}
      prev={prev}
      next={next}
      blocks={lesson?.blocks}
      locked={
        access === "signed-out" || access === "not-enrolled" ? (
          <ElectiveLockedPanel
            slug={elective.slug}
            title={elective.title}
            access={access}
            returnTo={`${href}/${meta.slug}`}
          />
        ) : undefined
      }
    />
  );
}
