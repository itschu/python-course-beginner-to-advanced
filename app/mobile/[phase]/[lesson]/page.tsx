import type { Metadata } from "next";

import { CourseLessonPage, lessonMetadata, lessonParams } from "@/components/course/lesson-page";
import { mobileCourse } from "@/content/courses";

export const dynamicParams = false;

export function generateStaticParams() {
  return lessonParams(mobileCourse);
}

export async function generateMetadata({ params }: PageProps<"/mobile/[phase]/[lesson]">): Promise<Metadata> {
  const { phase, lesson } = await params;
  return lessonMetadata(mobileCourse, phase, lesson);
}

export default async function LessonPage({ params }: PageProps<"/mobile/[phase]/[lesson]">) {
  const { phase, lesson } = await params;
  return <CourseLessonPage course={mobileCourse} phaseSlug={phase} lessonSlug={lesson} />;
}
