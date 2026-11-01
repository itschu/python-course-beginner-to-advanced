import type { CourseMeta } from "@/lib/types";

/** Each course's colour for phase-number badges. Full class names so Tailwind finds them. */
const ACCENTS: Record<string, string> = {
  pypath: "bg-blue-600",
  mobile: "bg-violet-600",
};

export const courseAccent = (course: Pick<CourseMeta, "slug">) => ACCENTS[course.slug] ?? "bg-blue-600";
