import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PhaseOverview } from "@/components/course/phase-overview";
import { mainCourse } from "@/content/courses";
import { getPhase, getPhases } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPhases(mainCourse).map((p) => ({ phase: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/learn/[phase]">): Promise<Metadata> {
  const { phase: slug } = await params;
  const phase = getPhase(slug, mainCourse);
  return phase ? { title: `Phase ${phase.number}: ${phase.title}`, description: phase.tagline } : {};
}

export default async function PhasePage({ params }: PageProps<"/learn/[phase]">) {
  const { phase: slug } = await params;
  const phase = getPhase(slug, mainCourse);
  if (!phase) notFound();
  return <PhaseOverview course={mainCourse} phase={phase} />;
}
