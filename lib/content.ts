import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

import { phases } from "@/content/curriculum";
import { parseLessonBody, type RawBlock } from "@/lib/lesson-parser";
import { renderInlineMarkdown, renderMarkdown } from "@/lib/markdown";
import type { Block, Lesson, LessonKind, LessonMeta, PhaseMeta } from "@/lib/types";

const CONTENT_DIR = path.join(process.cwd(), "content");
const FILE_RE = /^(\d+)-([a-z0-9-]+)\.md$/;

interface LoadedLesson {
  meta: LessonMeta & { colab?: string };
  raw: RawBlock[];
}

let loaded: Map<string, LoadedLesson[]> | null = null;

function loadAll(): Map<string, LoadedLesson[]> {
  if (loaded && process.env.NODE_ENV === "production") return loaded;
  const result = new Map<string, LoadedLesson[]>();
  for (const phase of phases) {
    const dir = path.join(CONTENT_DIR, phase.slug);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => FILE_RE.test(f)) : [];
    const lessons = files
      .map((file): LoadedLesson => {
        const [, order, slug] = file.match(FILE_RE)!;
        const source = fs.readFileSync(path.join(dir, file), "utf8");
        const { data, content } = matter(source);
        const raw = parseLessonBody(content, `${phase.slug}/${file}`);
        const exerciseIds: string[] = [];
        const quizIds: string[] = [];
        for (const block of raw) {
          if (block.kind === "exercise") exerciseIds.push(block.id);
          if (block.kind === "quiz") quizIds.push(block.id);
        }
        const ids = [...exerciseIds, ...quizIds];
        const dupe = ids.find((id, idx) => ids.indexOf(id) !== idx);
        if (dupe) throw new Error(`${phase.slug}/${file}: duplicate block id "${dupe}"`);
        if (!data.title) throw new Error(`${phase.slug}/${file}: missing title in frontmatter`);
        return {
          meta: {
            key: `${phase.slug}/${slug}`,
            phaseSlug: phase.slug,
            slug,
            order: Number(order),
            title: String(data.title),
            summary: String(data.summary ?? ""),
            minutes: Number(data.minutes ?? 30),
            kind: (data.kind ?? "lesson") as LessonKind,
            exerciseIds,
            quizIds,
            colab: data.colab ? String(data.colab) : undefined,
          },
          raw,
        };
      })
      .sort((a, b) => a.meta.order - b.meta.order);
    result.set(phase.slug, lessons);
  }
  loaded = result;
  return result;
}

export function getPhases(): PhaseMeta[] {
  return phases;
}

export function getPhase(slug: string): PhaseMeta | undefined {
  return phases.find((p) => p.slug === slug);
}

export function getLessonMetas(phaseSlug: string): (LessonMeta & { colab?: string })[] {
  return (loadAll().get(phaseSlug) ?? []).map((l) => l.meta);
}

export function getAllLessonMetas(): LessonMeta[] {
  return phases.flatMap((p) => getLessonMetas(p.slug));
}

export function getAdjacentLessons(key: string): { prev?: LessonMeta; next?: LessonMeta } {
  const all = getAllLessonMetas();
  const idx = all.findIndex((l) => l.key === key);
  return { prev: all[idx - 1], next: all[idx + 1] };
}

export function getCourseStats() {
  const all = getAllLessonMetas();
  return {
    phases: phases.length,
    lessons: all.filter((l) => l.kind === "lesson").length,
    projects: all.filter((l) => l.kind === "project").length,
    checkpoints: all.filter((l) => l.kind === "checkpoint").length,
    exercises: all.reduce((n, l) => n + l.exerciseIds.length, 0),
    quizzes: all.reduce((n, l) => n + l.quizIds.length, 0),
    hours: Math.round(all.reduce((n, l) => n + l.minutes, 0) / 60),
    resources: phases.reduce((n, p) => n + p.resources.length, 0),
  };
}

async function renderBlock(block: RawBlock, index: number): Promise<Block> {
  switch (block.kind) {
    case "md":
      return { type: "markdown", html: await renderMarkdown(block.text) };
    case "code":
      if (block.meta.includes("static")) {
        return {
          type: "static-code",
          html: await renderMarkdown("```python\n" + block.code + "\n```"),
        };
      }
      return { type: "code", id: `cell-${index}`, code: block.code, runnable: true };
    case "exercise":
      return {
        type: "exercise",
        id: block.id,
        title: block.title,
        promptHtml: await renderMarkdown(block.prompt),
        starter: block.starter,
        solution: block.solution,
        solutionHtml: await renderMarkdown("```python\n" + block.solution + "\n```"),
        tests: block.tests,
        hintsHtml: await Promise.all(block.hints.map((h) => renderMarkdown(h))),
      };
    case "quiz":
      return {
        type: "quiz",
        id: block.id,
        title: block.title,
        questions: await Promise.all(
          block.questions.map(async (q) => ({
            promptHtml: await renderMarkdown(q.prompt),
            options: await Promise.all(
              q.options.map(async (o) => ({
                html: await renderInlineMarkdown(o.text),
                correct: o.correct,
              })),
            ),
            explanationHtml: await renderMarkdown(q.explanation),
            multiple: q.options.filter((o) => o.correct).length > 1,
          })),
        ),
      };
    case "callout":
      return {
        type: "callout",
        variant: block.variant,
        title: block.title,
        html: await renderMarkdown(block.body),
      };
  }
}

export async function getLesson(
  phaseSlug: string,
  lessonSlug: string,
): Promise<(Lesson & { colab?: string }) | null> {
  const lesson = (loadAll().get(phaseSlug) ?? []).find((l) => l.meta.slug === lessonSlug);
  if (!lesson) return null;
  const blocks = await Promise.all(lesson.raw.map(renderBlock));
  return { ...lesson.meta, blocks };
}
