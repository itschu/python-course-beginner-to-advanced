import type { Metadata } from "next";

import { CourseRoadmap } from "@/components/course/course-roadmap";
import { mainCourse } from "@/content/courses";

export const metadata: Metadata = {
  title: "Course roadmap",
  description: "Every phase and lesson in the course, from Python basics to Rust, machine learning and models on microcontrollers.",
};

export default function LearnPage() {
  return <CourseRoadmap course={mainCourse} title="Course roadmap" />;
}
