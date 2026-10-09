import { AlertTriangle, BookOpen, Info, Lightbulb, NotebookPen } from "lucide-react";

import { Quiz } from "@/components/lesson/quiz";
import { CodeCell } from "@/components/python/code-cell";
import { Exercise } from "@/components/python/exercise";
import type { Block } from "@/lib/types";

const CALLOUT_STYLES = {
  note: {
    icon: BookOpen,
    className: "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30",
    iconClass: "text-sky-600 dark:text-sky-400",
    label: "Note",
  },
  info: {
    icon: Info,
    className: "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30",
    iconClass: "text-sky-600 dark:text-sky-400",
    label: "Info",
  },
  tip: {
    icon: Lightbulb,
    className: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    label: "Tip",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
    iconClass: "text-amber-600 dark:text-amber-400",
    label: "Watch out",
  },
  colab: {
    icon: NotebookPen,
    className: "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30",
    iconClass: "text-orange-600 dark:text-orange-400",
    label: "Run this in Google Colab",
  },
} as const;

export function LessonBody({ blocks, lessonKey }: { blocks: Block[]; lessonKey: string }) {
  return (
    <div className="lesson-body prose prose-zinc dark:prose-invert max-w-none">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "markdown":
            return <div key={i} dangerouslySetInnerHTML={{ __html: block.html }} />;
          case "static-code":
            return <div key={i} className="code-block" dangerouslySetInnerHTML={{ __html: block.html }} />;
          case "code":
            return <CodeCell key={i} code={block.code} />;
          case "exercise":
            return (
              <Exercise
                key={block.id}
                lessonKey={lessonKey}
                id={block.id}
                title={block.title}
                promptHtml={block.promptHtml}
                starter={block.starter}
                solution={block.solution}
                solutionHtml={block.solutionHtml}
                tests={block.tests}
                hintsHtml={block.hintsHtml}
              />
            );
          case "quiz":
            return (
              <Quiz key={block.id} lessonKey={lessonKey} id={block.id} title={block.title} questions={block.questions} />
            );
          case "callout": {
            const style = CALLOUT_STYLES[block.variant];
            const Icon = style.icon;
            return (
              <aside key={i} className={`not-prose my-6 rounded-xl border px-4 py-3 ${style.className}`}>
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <Icon className={`size-4 ${style.iconClass}`} aria-hidden />
                  {block.title || style.label}
                </div>
                <div
                  className="prose prose-sm prose-zinc dark:prose-invert prose-p:my-1.5 max-w-none"
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
              </aside>
            );
          }
        }
      })}
    </div>
  );
}
