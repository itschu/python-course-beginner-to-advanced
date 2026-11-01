import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PhaseOverview } from "@/components/course/phase-overview";
import { mobileCourse } from "@/content/courses";
import { getPhase, getPhases } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPhases(mobileCourse).map((p) => ({ phase: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/mobile/[phase]">): Promise<Metadata> {
  const { phase: slug } = await params;
  const phase = getPhase(slug, mobileCourse);
  return phase ? { title: `Mobile phase ${phase.number}: ${phase.title}`, description: phase.tagline } : {};
}

export default async function PhasePage({ params }: PageProps<"/mobile/[phase]">) {
  const { phase: slug } = await params;
  const phase = getPhase(slug, mobileCourse);
  if (!phase) notFound();
  return <PhaseOverview course={mobileCourse} phase={phase} />;
}
