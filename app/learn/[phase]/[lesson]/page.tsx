import type { Metadata } from "next";

import { CourseLessonPage, lessonMetadata, lessonParams } from "@/components/course/lesson-page";
import { mainCourse } from "@/content/courses";

export const dynamicParams = false;

export function generateStaticParams() {
  return lessonParams(mainCourse);
}

export async function generateMetadata({ params }: PageProps<"/learn/[phase]/[lesson]">): Promise<Metadata> {
  const { phase, lesson } = await params;
  return lessonMetadata(mainCourse, phase, lesson);
}

export default async function LessonPage({ params }: PageProps<"/learn/[phase]/[lesson]">) {
  const { phase, lesson } = await params;
  return <CourseLessonPage course={mainCourse} phaseSlug={phase} lessonSlug={lesson} />;
}
